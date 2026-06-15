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
import { pickAttachments } from '../chat/attachments'
import { buildMessageWithAttachments } from '@shared/chat-attachments'
import type { ChatAttachment, ChatMessage, ChatStreamEvent } from '@shared/types'

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
    .flatMap((m): LlmMessage[] => {
      if (m.role === 'assistant') {
        // Prepend tool-call names so weak models see "I used a tool last turn"
        // and learn the expected behaviour from in-context examples.
        const calls = (m.toolEvents ?? [])
          .filter((e): e is Extract<typeof e, { kind: 'call' }> => e.kind === 'call')
          .map((e) => e.name)
        const toolPrefix = calls.length > 0 ? `[Outils utilisés : ${calls.join(', ')}]\n` : ''
        const fullContent = (toolPrefix + m.content.trim()).trim()
        if (!fullContent) return []
        return [{ role: 'assistant', content: fullContent }]
      }
      if (!m.content.trim()) return []
      return [{ role: m.role as 'system' | 'user', content: m.content }]
    })
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

  const tuleapToolsSection = `## Outils Tuleap

**get_self** — Utilisateur connecté (id, username, nom, email)
→ "Qui suis-je ?" → get_self {}

**list_trackers** — Trackers du projet courant
→ "Quels trackers ?" → list_trackers {}

**list_artifacts** — Artéfacts d'un tracker (trackerId requis, limit/offset optionnels)
→ "Items du tracker 12 ?" → list_artifacts { "trackerId": 12 }
→ "Page 2 ?" → list_artifacts { "trackerId": 12, "limit": 25, "offset": 25 }

**get_artifact** — Détail complet d'un artéfact (id requis)
→ "Artéfact 5678 ?" → get_artifact { "id": 5678 }

**list_milestones** — Sprints du projet (status: open|closed|all, défaut: open)
→ "Sprint en cours ?" → list_milestones {}
→ "Tous les sprints ?" → list_milestones { "status": "all" }

**find_artifacts_by_assignee** — Artéfacts assignés à une personne (filtre en mémoire par nom)
→ "User stories assignées à Alexandre ?" → find_artifacts_by_assignee { "trackerId": 12, "assigneeName": "Alexandre" }
→ "Tâches d'Alice Dupont ?" → find_artifacts_by_assignee { "trackerId": 5, "assigneeName": "Alice Dupont" }`

  const jenkinsToolsSection = !jenkinsOk ? '' : `
## Outils Jenkins

**jenkins_list_jobs** — Jobs à la racine ou dans un dossier
→ "Jobs Jenkins ?" → jenkins_list_jobs {}
→ "Jobs dans api ?" → jenkins_list_jobs { "folder": "api" }

**jenkins_get_build_history** — Derniers builds d'un job (jobName requis, limit défaut 10)
→ "Builds de mon-api ?" → jenkins_get_build_history { "jobName": "mon-api" }

**jenkins_get_build_detail** — Détails d'un build (jobName + buildNumber requis)
→ "Build #42 de mon-api ?" → jenkins_get_build_detail { "jobName": "mon-api", "buildNumber": 42 }

**jenkins_get_test_report** — Tests JUnit d'un build (jobName + buildNumber requis)
→ "Tests du build #42 ?" → jenkins_get_test_report { "jobName": "mon-api", "buildNumber": 42 }

**jenkins_get_queue** — File d'attente Jenkins
→ "Builds en attente ?" → jenkins_get_queue {}`

  const chainedExample = !jenkinsOk ? `## Exemple de raisonnement correct
Question : "Combien d'items dans le tracker Bugs ?"
Étape 1 — Je ne connais pas l'id du tracker → list_trackers {} → id=7
Étape 2 — Je veux le nombre d'artéfacts → list_artifacts { "trackerId": 7 } → total=42
Réponse : "Le tracker Bugs contient 42 artéfacts."` : `## Exemple de raisonnement correct
Question : "Tests du dernier build de mon-api ?"
Étape 1 — Je veux le dernier numéro de build → jenkins_get_build_history { "jobName": "mon-api", "limit": 1 } → buildNumber=87
Étape 2 — Je veux le rapport → jenkins_get_test_report { "jobName": "mon-api", "buildNumber": 87 } → 3 échoués
Réponse : "Build #87 : 102 tests, 99 passés, 3 échoués : [...]"`

  const basePrompt = `Tu es un assistant IA intégré à Tuleap${jenkinsOk ? ' et Jenkins' : ''}. Tu réponds en français, de façon concise.

## ⚡ RÈGLE ABSOLUE
Dès qu'une question porte sur des données réelles (artéfacts, utilisateurs, builds, sprints, tests) :
1. Identifie l'outil approprié dans la liste ci-dessous
2. Appelle-le — écrire quelque chose avant ou après l'appel est autorisé
3. Base ta réponse uniquement sur les données retournées par l'outil

⛔ Interdit : inventer un id, un titre, un résultat ou un statut sans appeler l'outil.
✅ Sans outil : questions conceptuelles, calculs, explications générales.

${contextBlock}

${tuleapToolsSection}
${jenkinsToolsSection}

${chainedExample}

## Format
- Ids Tuleap : #1234${config.tuleapUrl ? `  (lien : ${config.tuleapUrl}/plugins/tracker/?aid=1234)` : ''}
- Tableaux si > 3 éléments
- Si un outil échoue : expliquer brièvement et proposer une correction`

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

  ipcMain.handle('chat:pick-attachments', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    audit('chat.attachments.pick')
    return pickAttachments(win)
  })

  ipcMain.handle('chat:send-message', async (event, args: unknown) => {
    const opts = (args ?? {}) as {
      conversationId?: number
      content?: string
      thinking?: boolean
      attachments?: ChatAttachment[]
    }
    if (typeof opts.conversationId !== 'number' || typeof opts.content !== 'string') {
      throw new Error('Arguments invalides.')
    }
    const attachments = Array.isArray(opts.attachments)
      ? opts.attachments.filter(
          (a): a is ChatAttachment =>
            a != null && typeof a.name === 'string' && typeof a.text === 'string'
        )
      : []
    const trimmed = opts.content.trim()
    if (!trimmed && attachments.length === 0) throw new Error('Message vide.')

    const conv = getConversation(opts.conversationId)
    if (!conv) throw new Error('Conversation introuvable.')

    const question = trimmed || 'Analyse le(s) document(s) joint(s).'
    const userContent = buildMessageWithAttachments(question, attachments)
    addMessage({ conversationId: conv.id, role: 'user', content: userContent })
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

    audit('chat.message.send', String(conv.id), {
      length: userContent.length,
      attachments: attachments.length
    })

    const history = listMessages(conv.id)
    const llmMessages = ensureSystemMessage(history.slice(0, -1)) // exclude the empty assistant we just inserted

    // Text streamed so far (sum of onText deltas). Used to persist progress and
    // to compute the remainder if the final answer is longer than streamed.
    let streamed = ''
    let sawToolCall = false
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

      // Explicit agentic loop: the provider runs model → tools → model until the
      // model produces a final text answer (or maxSteps is hit). Tool events and
      // text are surfaced live via callbacks. result.text IS the answer — no
      // synthesis fallback, no heuristics. Order of text vs. tools doesn't matter.
      const result = await provider.runTools(
        {
          messages: llmMessages,
          tools,
          temperature: 0.2,
          maxOutputTokens: thinking ? 24000 : 8192,
          maxSteps: 8,
          thinking
        },
        {
          onToolEvent: (ev) => {
            if (ev.kind === 'call') {
              sawToolCall = true
              appendToolEvent(assistant.id, {
                kind: 'call',
                name: ev.toolName,
                toolCallId: ev.toolCallId,
                args: ev.args
              })
              broadcast(senderId, {
                type: 'tool-call',
                conversationId: conv.id,
                assistantMessageId: assistant.id,
                toolCallId: ev.toolCallId,
                name: ev.toolName,
                args: ev.args
              })
            } else {
              appendToolEvent(assistant.id, {
                kind: 'result',
                name: ev.toolName,
                toolCallId: ev.toolCallId,
                result: ev.result,
                error: ev.error
              })
              broadcast(senderId, {
                type: 'tool-result',
                conversationId: conv.id,
                assistantMessageId: assistant.id,
                toolCallId: ev.toolCallId,
                name: ev.toolName,
                result: ev.result,
                error: ev.error
              })
            }
          },
          onText: (delta) => {
            streamed += delta
            updateMessageContent(assistant.id, streamed)
            broadcast(senderId, {
              type: 'delta',
              conversationId: conv.id,
              assistantMessageId: assistant.id,
              delta
            })
          }
        }
      )

      // result.text is the authoritative final answer. If callbacks streamed
      // less than the final text (provider quirk), emit the remainder.
      let finalText = result.text.trim() || streamed.trim()
      if (finalText && finalText.length > streamed.length) {
        const remainder = finalText.startsWith(streamed)
          ? finalText.slice(streamed.length)
          : finalText
        if (remainder) {
          broadcast(senderId, {
            type: 'delta',
            conversationId: conv.id,
            assistantMessageId: assistant.id,
            delta: remainder
          })
        }
      }

      // Only happens if the model genuinely produced nothing. Explain plainly.
      if (!finalText) {
        finalText = sawToolCall
          ? "_Les outils ont été appelés mais le modèle n'a pas formulé de réponse. Les résultats sont affichés ci-dessus. Réessayez._"
          : `_Le modèle n'a renvoyé aucune réponse (raison : ${result.finishReason ?? 'inconnue'}). Réessayez._`
        broadcast(senderId, {
          type: 'delta',
          conversationId: conv.id,
          assistantMessageId: assistant.id,
          delta: finalText
        })
      }

      updateMessageContent(assistant.id, finalText)
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
      autoNameConversation(conv.id, question).catch((e) =>
        debugError('[chat] auto-name failed: %s', e instanceof Error ? e.message : String(e))
      )

      return { ok: true, assistantMessageId: assistant.id }
    } catch (err) {
      const e = toLlmError(err)
      debugError('[chat] runTools error kind=%s message=%s', e.kind, e.message)
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
