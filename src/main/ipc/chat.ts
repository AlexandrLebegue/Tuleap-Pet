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
import { resolveLlmProvider, buildTuleapTools, buildTuleapWriteTools, toLlmError } from '../llm'
import { buildJenkinsTools } from '../llm/jenkins-tools'
import type { LlmMessage } from '../llm'
import { getChatbotDoxygenMode, getChatbotExpertMode, getChatbotToolsEnabled, getChatbotJenkinsToolsEnabled, getConfig, getLlmModel, getLlmProvider, getLocalModel } from '../store/config'
import { hasJenkinsToken } from '../store/secrets'
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

function buildContextBlock(): string {
  const config = getConfig()
  const jenkinsOk = Boolean(config.jenkinsUrl && hasJenkinsToken())

  const lines: string[] = ['## Contexte utilisateur configuré']

  if (config.tuleapUrl) {
    lines.push(`Tuleap : ${config.tuleapUrl}`)
  }
  if (config.projectId !== null) {
    lines.push(`Projet sélectionné : ID ${config.projectId}`)
  } else {
    lines.push(`⚠ Aucun projet sélectionné — inviter l'utilisateur à en configurer un dans les Paramètres.`)
  }
  if (jenkinsOk) {
    const userPart = config.jenkinsUser ? `  (utilisateur : ${config.jenkinsUser})` : ''
    lines.push(`Jenkins : ${config.jenkinsUrl}${userPart}`)
    if (config.jenkinsRepoMapping && Object.keys(config.jenkinsRepoMapping).length > 0) {
      lines.push(`Mapping repo → job Jenkins : ${JSON.stringify(config.jenkinsRepoMapping)}`)
    }
  }
  if (config.ttmTrackerId !== null) {
    lines.push(`Tracker TTM : ID ${config.ttmTrackerId}`)
  }

  return lines.join('\n')
}

function buildSystemPrompt(): string {
  const config = getConfig()
  const expertMode = getChatbotExpertMode()
  const doxygenMode = getChatbotDoxygenMode()
  const jenkinsOk = Boolean(config.jenkinsUrl && hasJenkinsToken())

  const contextBlock = buildContextBlock()

  const tuleapToolsSection = `## Outils Tuleap — utilisation et exemples

**get_self** — Renvoie l'utilisateur Tuleap connecté (id, username, nom, email). Aucun paramètre.
→ Exemple : "Qui suis-je ?" → appeler get_self {}

**list_trackers** — Liste les trackers du projet courant. Paramètre optionnel : projectId (si omis, utilise le projet configuré ci-dessus).
→ Exemple : "Quels trackers existent ?" → appeler list_trackers {}

**list_artifacts** — Liste les artéfacts d'un tracker. trackerId obligatoire. limit et offset optionnels (défaut : 25).
→ Exemple : "Items du tracker 12 ?" → appeler list_artifacts { trackerId: 12 }
→ Exemple : "Page 2 du tracker 12 ?" → appeler list_artifacts { trackerId: 12, limit: 25, offset: 25 }

**get_artifact** — Détail complet d'un artéfact : titre, statut, description, champs, liens. id obligatoire.
→ Exemple : "Détails de l'artéfact 5678 ?" → appeler get_artifact { id: 5678 }

**list_milestones** — Sprints du projet courant. status optionnel : open | closed | all (défaut open).
→ Exemple : "Sprint en cours ?" → appeler list_milestones {}
→ Exemple : "Tous les sprints ?" → appeler list_milestones { status: "all" }`

  const jenkinsToolsSection = !jenkinsOk ? '' : `
## Outils Jenkins — utilisation et exemples

**jenkins_list_jobs** — Liste les jobs Jenkins à la racine ou dans un dossier.
→ Exemple : "Jobs Jenkins ?" → appeler jenkins_list_jobs {}
→ Exemple : "Jobs dans le dossier api ?" → appeler jenkins_list_jobs { folder: "api" }

**jenkins_get_build_history** — Derniers builds d'un job. jobName obligatoire. limit optionnel (défaut 10).
→ Exemple : "Derniers builds de mon-api ?" → appeler jenkins_get_build_history { jobName: "mon-api" }

**jenkins_get_build_detail** — Détails d'un build précis : résultat, durée, paramètres, résumé tests. jobName et buildNumber obligatoires.
→ Exemple : "Détails du build #42 de mon-api ?" → appeler jenkins_get_build_detail { jobName: "mon-api", buildNumber: 42 }

**jenkins_get_test_report** — Rapport JUnit d'un build : passés / échoués / ignorés + liste des tests échoués. jobName et buildNumber obligatoires.
→ Exemple : "Tests du build #42 ?" → appeler jenkins_get_test_report { jobName: "mon-api", buildNumber: 42 }

**jenkins_get_queue** — File d'attente Jenkins. Aucun paramètre.
→ Exemple : "Builds en attente ?" → appeler jenkins_get_queue {}`

  const chainedExample = !jenkinsOk ? `## Exemple chaîné
Question : "Combien d'items dans le tracker Bugs ?"
→ Étape 1 : appeler list_trackers {} → trouver l'id du tracker "Bugs" (ex: 7)
→ Étape 2 : appeler list_artifacts { trackerId: 7 } → lire le champ total
→ Répondre : "Le tracker Bugs contient X artéfacts."` : `## Exemple chaîné (Tuleap + Jenkins)
Question : "Résultats des tests du dernier build de mon-api ?"
→ Étape 1 : appeler jenkins_get_build_history { jobName: "mon-api", limit: 1 } → buildNumber = 87
→ Étape 2 : appeler jenkins_get_test_report { jobName: "mon-api", buildNumber: 87 }
→ Répondre : "Build #87 : 102 tests, 99 passés, 3 échoués : [liste des tests échoués]"`

  const basePrompt = `Tu es un assistant intégré à Tuleap${jenkinsOk ? ' et Jenkins' : ''}. Tu réponds en français, de façon concise et structurée.

${contextBlock}

## Règle fondamentale
Appelle un outil dès que la question porte sur des données réelles (artéfacts, builds, tests, sprints, utilisateur).
Ne JAMAIS inventer un id, un titre, un résultat ou un statut.
Si la question est conversationnelle ou conceptuelle, réponds directement sans outil.

${tuleapToolsSection}
${jenkinsToolsSection}

${chainedExample}

## Règles de formatage
- Ids Tuleap entre crochets : #1234${config.tuleapUrl ? `  — lien direct : ${config.tuleapUrl}/plugins/tracker/?aid=1234` : ''}
- Listes ou tableaux quand plus de 3 éléments
- Si un outil échoue : expliquer brièvement l'erreur et proposer une correction`

  if (expertMode) {
    const expertSection = doxygenMode ? getCombinedPrompt(true) : getExpertSystemPrompt()
    return `${basePrompt}\n\n---\n\n# Mode Expert C/C++\n\n${expertSection}`
  }

  return basePrompt
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
      const jenkinsToolsEnabled = getChatbotJenkinsToolsEnabled()
      debugLog('[chat] provider=%s model=%s thinking=%s tools=%s jenkins=%s', provider.name,
        provider.name === 'local' ? getLocalModel() : getLlmModel(), thinking, toolsEnabled, jenkinsToolsEnabled)
      const tools = toolsEnabled
        ? { ...buildTuleapTools(), ...buildTuleapWriteTools(), ...(jenkinsToolsEnabled ? buildJenkinsTools() : {}) }
        : undefined
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
