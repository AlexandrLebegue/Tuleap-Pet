import { BrowserWindow, ipcMain } from 'electron'
import {
  addMessage,
  appendToolEvent,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  listMessages,
  renameConversation,
  updateMessageContent
} from '../chat/manager'
import { audit } from '../store/db'
import { resolveLlmProvider, buildTuleapTools, toLlmError } from '../llm'
import type { LlmMessage } from '../llm'
import { getChatbotDoxygenMode, getChatbotExpertMode, getChatbotToolsEnabled, getLlmModel, getLlmProvider, getLocalModel } from '../store/config'
import { getCombinedPrompt, getExpertSystemPrompt } from '../prompts/expert-prompts'
import { debugLog, debugError } from '../logger'
import type { ChatMessage, ChatStreamEvent } from '@shared/types'

const STREAM_CHANNEL = 'chat:stream'

function broadcast(senderId: number, event: ChatStreamEvent): void {
  const win = BrowserWindow.fromId(senderId)
  if (win && !win.isDestroyed()) {
    win.webContents.send(STREAM_CHANNEL, event)
  }
}

function chatHistoryAsLlmMessages(history: ChatMessage[]): LlmMessage[] {
  return history
    .filter((m) => m.role === 'system' || m.role === 'user' || m.role === 'assistant')
    .filter((m) => m.content.trim().length > 0)
    .map(
      (m) =>
        ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content
        }) satisfies LlmMessage
    )
}

const SYSTEM_PROMPT = `Tu es un assistant intégré à un client Tuleap (outil de gestion de projet ALM). Tu réponds en français de manière concise et structurée.

## Règles d'utilisation des outils (tools)

Tu disposes des outils suivants pour interroger l'API Tuleap :
- **get_self** : Récupère l'utilisateur connecté (id, username, real_name, email). Aucun paramètre.
- **list_projects** : Liste les projets accessibles. Paramètre optionnel : query (filtre shortname).
- **list_trackers** : Liste les trackers du projet courant ou d'un projet donné. Paramètre optionnel : projectId.
- **list_artifacts** : Liste les artéfacts d'un tracker. Paramètres : trackerId (obligatoire), limit, offset.
- **get_artifact** : Récupère le détail d'un artéfact (titre, description, statut, valeurs, liens). Paramètre : id (obligatoire).
- **list_milestones** : Liste les milestones/sprints du projet. Paramètres optionnels : projectId, status (open|closed|all).

## Comportement attendu

1. **TOUJOURS** appeler un outil quand la question porte sur des données Tuleap (artéfacts, trackers, projets, sprints, utilisateur). Ne JAMAIS inventer un id, un titre ou un statut.
2. Si la question est générale ou conversationnelle (salutations, explications conceptuelles), réponds directement SANS appeler d'outil.
3. Tu peux enchaîner plusieurs appels d'outils si nécessaire (ex: list_trackers puis list_artifacts).
4. Si un outil échoue, explique l'erreur simplement et propose une solution (vérifier l'id, sélectionner un projet, etc.).
5. Cite toujours les ids entre crochets : #1234.
6. Structure tes réponses avec des listes ou tableaux quand c'est pertinent.

## Exemples de patterns

- "Quels sont mes projets ?" -> appeler list_projects
- "Montre-moi le sprint en cours" -> appeler list_milestones avec status=open
- "Détail de l'artéfact 5678" -> appeler get_artifact avec id=5678
- "Combien d'items dans le tracker Bugs ?" -> appeler list_trackers puis list_artifacts`

function buildSystemPrompt(): string {
  const expertMode = getChatbotExpertMode()
  const doxygenMode = getChatbotDoxygenMode()

  let prompt = SYSTEM_PROMPT

  if (expertMode) {
    const expertSection = doxygenMode ? getCombinedPrompt(true) : getExpertSystemPrompt()
    prompt = `${SYSTEM_PROMPT}\n\n---\n\n# Mode Expert C/C++\n\n${expertSection}`
  }

  return prompt
}

function ensureSystemMessage(history: ChatMessage[]): LlmMessage[] {
  const llmHistory = chatHistoryAsLlmMessages(history)
  if (llmHistory.length === 0 || llmHistory[0]?.role !== 'system') {
    llmHistory.unshift({ role: 'system', content: buildSystemPrompt() })
  }
  return llmHistory
}

const DEFAULT_TITLE = 'Nouvelle conversation'

/**
 * Auto-generates a short conversation title using the LLM based on the first user message.
 * Runs asynchronously without blocking the response flow.
 */
async function autoNameConversation(conversationId: number, firstUserMessage: string): Promise<void> {
  const conv = getConversation(conversationId)
  if (!conv || conv.title !== DEFAULT_TITLE) return // already renamed or not found

  // Count messages to ensure this is the first exchange
  const messages = listMessages(conversationId)
  const userMessages = messages.filter((m) => m.role === 'user')
  if (userMessages.length > 1) return // not the first exchange

  try {
    const provider = resolveLlmProvider()
    const result = await provider.generate({
      messages: [
        {
          role: 'system',
          content:
            'Generate a short title (max 6 words, no quotes, no punctuation at end) summarizing the user question below. Reply with ONLY the title, nothing else. Use the same language as the user message.'
        },
        { role: 'user', content: firstUserMessage.slice(0, 200) }
      ],
      maxOutputTokens: 30,
      temperature: 0.2
    })
    const title = result.text.trim().replace(/["""]/g, '').replace(/[.!?]+$/, '').slice(0, 60)
    if (title.length > 2) {
      renameConversation(conversationId, title)
      debugLog('[chat] auto-named conversation %d → "%s"', conversationId, title)
    }
  } catch (err) {
    debugError('[chat] auto-name LLM error: %s', err instanceof Error ? err.message : String(err))
  }
}

export function registerChatHandlers(): void {
  ipcMain.handle('chat:list-conversations', () => {
    return listConversations()
  })

  ipcMain.handle('chat:get-conversation', (_event, id: unknown) => {
    if (typeof id !== 'number') throw new Error('id invalide.')
    const conv = getConversation(id)
    if (!conv) throw new Error('Conversation introuvable.')
    return { conversation: conv, messages: listMessages(id) }
  })

  ipcMain.handle('chat:create-conversation', (_event, args: unknown) => {
    const opts = (args ?? {}) as { title?: string; projectId?: number | null }
    audit('chat.conversation.create', opts.title ?? null)
    const model =
      getLlmProvider() === 'local' ? (getLocalModel() ?? 'local') : getLlmModel()
    return createConversation({
      title: opts.title,
      projectId: opts.projectId ?? null,
      model
    })
  })

  ipcMain.handle('chat:rename-conversation', (_event, args: unknown) => {
    const opts = (args ?? {}) as { id?: number; title?: string }
    if (typeof opts.id !== 'number' || typeof opts.title !== 'string') {
      throw new Error('Arguments invalides.')
    }
    audit('chat.conversation.rename', String(opts.id))
    return renameConversation(opts.id, opts.title)
  })

  ipcMain.handle('chat:delete-conversation', (_event, id: unknown) => {
    if (typeof id !== 'number') throw new Error('id invalide.')
    audit('chat.conversation.delete', String(id))
    deleteConversation(id)
    return { ok: true }
  })

  ipcMain.handle('chat:send-message', async (event, args: unknown) => {
    const opts = (args ?? {}) as { conversationId?: number; content?: string; thinking?: boolean }
    if (typeof opts.conversationId !== 'number' || typeof opts.content !== 'string') {
      throw new Error('Arguments invalides.')
    }
    const trimmed = opts.content.trim()
    if (!trimmed) throw new Error('Message vide.')

    const conv = getConversation(opts.conversationId)
    if (!conv) throw new Error('Conversation introuvable.')

    addMessage({ conversationId: conv.id, role: 'user', content: trimmed })
    const assistant = addMessage({
      conversationId: conv.id,
      role: 'assistant',
      content: '',
      toolEvents: []
    })

    const win = BrowserWindow.fromWebContents(event.sender)
    const senderId = win?.id ?? -1

    broadcast(senderId, {
      type: 'started',
      conversationId: conv.id,
      assistantMessageId: assistant.id
    })

    audit('chat.message.send', String(conv.id), { length: trimmed.length })

    const history = listMessages(conv.id)
    const llmMessages = ensureSystemMessage(history.slice(0, -1)) // exclude the empty assistant we just inserted

    let buffered = ''
    try {
      const provider = resolveLlmProvider()
      const thinking = opts.thinking ?? false
      const toolsEnabled = getChatbotToolsEnabled()
      debugLog('[chat] provider=%s model=%s thinking=%s tools=%s', provider.name,
        provider.name === 'local' ? getLocalModel() : getLlmModel(), thinking, toolsEnabled)
      const tools = toolsEnabled ? buildTuleapTools() : undefined
      const result = await provider.stream(
        {
          messages: llmMessages,
          tools,
          temperature: 0.4,
          maxOutputTokens: thinking ? 16000 : 2048,
          thinking
        },
        (chunk) => {
          if (chunk.type === 'text') {
            buffered += chunk.delta
            broadcast(senderId, {
              type: 'delta',
              conversationId: conv.id,
              assistantMessageId: assistant.id,
              delta: chunk.delta
            })
          } else if (chunk.type === 'tool-call') {
            appendToolEvent(assistant.id, {
              kind: 'call',
              name: chunk.toolName,
              toolCallId: chunk.toolCallId,
              args: chunk.args
            })
            broadcast(senderId, {
              type: 'tool-call',
              conversationId: conv.id,
              assistantMessageId: assistant.id,
              toolCallId: chunk.toolCallId,
              name: chunk.toolName,
              args: chunk.args
            })
          } else if (chunk.type === 'tool-result') {
            appendToolEvent(assistant.id, {
              kind: 'result',
              name: chunk.toolName,
              toolCallId: chunk.toolCallId,
              result: chunk.result,
              error: chunk.error
            })
            broadcast(senderId, {
              type: 'tool-result',
              conversationId: conv.id,
              assistantMessageId: assistant.id,
              toolCallId: chunk.toolCallId,
              name: chunk.toolName,
              result: chunk.result,
              error: chunk.error
            })
          } else if (chunk.type === 'finish') {
            updateMessageContent(assistant.id, buffered)
          }
        }
      )
      // In multi-step tool calling the SDK's result.text may only contain
      // the LAST step's text, while buffered captures ALL text-delta events
      // from every step. Use buffered as primary source; fall back to
      // result.text only when no deltas were received at all.
      const finalText = buffered || result.text
      if (finalText !== buffered) {
        // No deltas streamed — persist result.text and broadcast it
        updateMessageContent(assistant.id, finalText)
        if (finalText) {
          broadcast(senderId, {
            type: 'delta',
            conversationId: conv.id,
            assistantMessageId: assistant.id,
            delta: finalText
          })
        }
        buffered = finalText
      }
      debugLog('[chat] done model=%s finishReason=%s tokens=%o',
        result.model, result.finishReason, result.usage)
      broadcast(senderId, {
        type: 'done',
        conversationId: conv.id,
        assistantMessageId: assistant.id,
        finishReason: result.finishReason,
        usage: result.usage,
        model: result.model
      })
      audit('chat.message.done', String(conv.id), { usage: result.usage })

      // Auto-name conversation on first successful reply
      autoNameConversation(conv.id, trimmed).catch((e) =>
        debugError('[chat] auto-name failed: %s', e instanceof Error ? e.message : String(e))
      )

      return { ok: true, assistantMessageId: assistant.id }
    } catch (err) {
      const e = toLlmError(err)
      debugError('[chat] stream error kind=%s message=%s', e.kind, e.message)
      const errorText = `[Erreur ${e.kind}] ${e.message}`
      updateMessageContent(assistant.id, errorText)
      broadcast(senderId, {
        type: 'error',
        conversationId: conv.id,
        assistantMessageId: assistant.id,
        error: e.message
      })
      audit('chat.message.error', String(conv.id), { kind: e.kind, message: e.message })
      return { ok: false, error: e.message, kind: e.kind, assistantMessageId: assistant.id }
    }
  })
}
