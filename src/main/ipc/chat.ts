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
import { getLlmModel } from '../store/config'
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

const SYSTEM_PROMPT = `Tu es un assistant intégré à un client Tuleap. Tu réponds en français de manière concise.

Tu disposes de tools pour interroger l'API Tuleap (utilisateur courant, projets, trackers, artéfacts, milestones). Tu DOIS appeler ces tools dès que la réponse demande une donnée Tuleap : ne jamais inventer un id, un titre, un statut.

Si une question ne nécessite pas de tool (général, conversationnel), réponds directement.
Si un tool échoue, explique l'erreur en termes simples et propose une étape suivante.
Toujours citer les ids des artéfacts entre crochets, ex. #1234.`

function ensureSystemMessage(history: ChatMessage[]): LlmMessage[] {
  const llmHistory = chatHistoryAsLlmMessages(history)
  if (llmHistory.length === 0 || llmHistory[0]?.role !== 'system') {
    llmHistory.unshift({ role: 'system', content: SYSTEM_PROMPT })
  }
  return llmHistory
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
    return createConversation({
      title: opts.title,
      projectId: opts.projectId ?? null,
      model: getLlmModel()
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
    const opts = (args ?? {}) as { conversationId?: number; content?: string }
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
      const tools = buildTuleapTools()
      const result = await provider.stream(
        {
          messages: llmMessages,
          tools,
          temperature: 0.4,
          maxOutputTokens: 2048
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
            // persist the final text once before broadcasting done.
            updateMessageContent(assistant.id, buffered)
            broadcast(senderId, {
              type: 'done',
              conversationId: conv.id,
              assistantMessageId: assistant.id,
              finishReason: chunk.finishReason,
              usage: chunk.usage,
              model: getLlmModel()
            })
          }
        }
      )
      // Safety: ensure the persisted content matches the final text.
      if (result.text && result.text !== buffered) {
        updateMessageContent(assistant.id, result.text)
        buffered = result.text
      }
      audit('chat.message.done', String(conv.id), { usage: result.usage })
      return { ok: true, assistantMessageId: assistant.id }
    } catch (err) {
      const e = toLlmError(err)
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
