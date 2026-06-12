import { create } from 'zustand'
import type {
  ChatAttachment,
  ChatConversation,
  ChatMessage,
  ChatStreamEvent,
  ChatToolEvent
} from '@shared/types'
import { api } from '@renderer/lib/api'

type Status = 'idle' | 'sending' | 'streaming' | 'error'

type Store = {
  conversations: ChatConversation[]
  loadingConversations: boolean
  selectedId: number | null
  messages: ChatMessage[]
  loadingMessages: boolean
  status: Status
  draft: string
  thinking: boolean
  errorMessage: string | null
  unsubscribe: (() => void) | null
  /** Deltas/tool events received before the 'started' DB reload completes —
   * the assistant row doesn't exist in `messages` yet, so they'd be lost. */
  pendingDeltas: Record<number, string>
  pendingToolEvents: Record<number, ChatToolEvent[]>
  /** Documents attached to the next message (already extracted as text). */
  attachments: ChatAttachment[]
  attachmentError: string | null
  pickingAttachments: boolean

  init: () => void
  shutdown: () => void
  refresh: () => Promise<void>
  open: (id: number) => Promise<void>
  newConversation: () => Promise<void>
  rename: (id: number, title: string) => Promise<void>
  remove: (id: number) => Promise<void>
  setDraft: (text: string) => void
  setThinking: (value: boolean) => void
  pickAttachments: () => Promise<void>
  removeAttachment: (index: number) => void
  send: () => Promise<void>
  handleEvent: (event: ChatStreamEvent) => void
}

function applyDelta(messages: ChatMessage[], id: number, delta: string): ChatMessage[] {
  return messages.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m))
}

/** Tool events arrive both via stream broadcast and via the 'started' DB
 * reload — dedupe on (kind, toolCallId) to avoid double entries. */
function dedupeToolEvents(events: ChatToolEvent[]): ChatToolEvent[] {
  const seen = new Set<string>()
  return events.filter((e) => {
    const key = `${e.kind}:${e.toolCallId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function applyToolEvent(messages: ChatMessage[], id: number, event: ChatToolEvent): ChatMessage[] {
  return messages.map((m) =>
    m.id === id ? { ...m, toolEvents: dedupeToolEvents([...(m.toolEvents ?? []), event]) } : m
  )
}

export const useChat = create<Store>((set, get) => ({
  conversations: [],
  loadingConversations: false,
  selectedId: null,
  messages: [],
  loadingMessages: false,
  status: 'idle',
  draft: '',
  thinking: false,
  errorMessage: null,
  unsubscribe: null,
  pendingDeltas: {},
  pendingToolEvents: {},
  attachments: [],
  attachmentError: null,
  pickingAttachments: false,

  init: () => {
    if (get().unsubscribe) return
    const off = api.chat.subscribe((event) => get().handleEvent(event))
    set({ unsubscribe: off })
  },

  shutdown: () => {
    const off = get().unsubscribe
    if (off) off()
    set({ unsubscribe: null })
  },

  refresh: async () => {
    set({ loadingConversations: true })
    try {
      const conversations = await api.chat.listConversations()
      set({ conversations, loadingConversations: false })
    } catch {
      set({ loadingConversations: false })
    }
  },

  open: async (id: number) => {
    set({
      selectedId: id,
      loadingMessages: true,
      messages: [],
      errorMessage: null,
      status: 'idle'
    })
    try {
      const result = await api.chat.getConversation(id)
      set({ messages: result.messages, loadingMessages: false })
    } catch (err) {
      set({
        loadingMessages: false,
        errorMessage: err instanceof Error ? err.message : String(err)
      })
    }
  },

  newConversation: async () => {
    const conv = await api.chat.createConversation({})
    await get().refresh()
    await get().open(conv.id)
  },

  rename: async (id: number, title: string) => {
    await api.chat.renameConversation(id, title)
    await get().refresh()
  },

  remove: async (id: number) => {
    await api.chat.deleteConversation(id)
    if (get().selectedId === id) {
      set({ selectedId: null, messages: [] })
    }
    await get().refresh()
  },

  setDraft: (text: string) => set({ draft: text }),

  setThinking: (value: boolean) => set({ thinking: value }),

  pickAttachments: async () => {
    if (get().pickingAttachments) return
    set({ pickingAttachments: true, attachmentError: null })
    try {
      const result = await api.chat.pickAttachments()
      set((state) => ({
        attachments: [...state.attachments, ...result.attachments].slice(0, 8),
        attachmentError: result.errors.length > 0 ? result.errors.join(' · ') : null,
        pickingAttachments: false
      }))
    } catch (err) {
      set({
        pickingAttachments: false,
        attachmentError: err instanceof Error ? err.message : String(err)
      })
    }
  },

  removeAttachment: (index: number) =>
    set((state) => ({ attachments: state.attachments.filter((_, i) => i !== index) })),

  send: async () => {
    const { selectedId, draft, thinking, attachments } = get()
    if (!selectedId) return
    const trimmed = draft.trim()
    if (!trimmed && attachments.length === 0) return
    set({ status: 'sending', draft: '', attachments: [], attachmentError: null, errorMessage: null })
    try {
      const result = await api.chat.sendMessage({
        conversationId: selectedId,
        content: trimmed,
        thinking,
        attachments: attachments.length > 0 ? attachments : undefined
      })
      if (!result.ok) {
        set({ status: 'error', errorMessage: result.error })
      }
    } catch (err) {
      set({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err)
      })
    }
  },

  handleEvent: (event: ChatStreamEvent) => {
    if (get().selectedId !== event.conversationId) {
      // Stream targets a different conversation: refresh in background and ignore.
      void get().refresh()
      return
    }
    switch (event.type) {
      case 'started': {
        set({ status: 'streaming', pendingDeltas: {}, pendingToolEvents: {} })
        // Reload from DB to pick up the freshly-inserted user + empty assistant
        // rows, then merge any deltas/tool events that streamed in while the
        // reload was in flight (fast models can beat the IPC roundtrip).
        void api.chat.getConversation(event.conversationId).then((r) => {
          set((state) => ({
            messages: r.messages.map((m) => {
              const pendingText = state.pendingDeltas[m.id]
              const pendingTools = state.pendingToolEvents[m.id]
              if (!pendingText && !pendingTools) return m
              return {
                ...m,
                content: m.content + (pendingText ?? ''),
                toolEvents: dedupeToolEvents([...(m.toolEvents ?? []), ...(pendingTools ?? [])])
              }
            }),
            pendingDeltas: {},
            pendingToolEvents: {}
          }))
        })
        break
      }
      case 'delta': {
        set((state) => {
          if (state.messages.some((m) => m.id === event.assistantMessageId)) {
            return { messages: applyDelta(state.messages, event.assistantMessageId, event.delta) }
          }
          // Assistant row not loaded yet — buffer instead of dropping.
          return {
            pendingDeltas: {
              ...state.pendingDeltas,
              [event.assistantMessageId]:
                (state.pendingDeltas[event.assistantMessageId] ?? '') + event.delta
            }
          }
        })
        break
      }
      case 'tool-call':
      case 'tool-result': {
        const toolEvent: ChatToolEvent =
          event.type === 'tool-call'
            ? { kind: 'call', name: event.name, toolCallId: event.toolCallId, args: event.args }
            : {
                kind: 'result',
                name: event.name,
                toolCallId: event.toolCallId,
                result: event.result,
                error: event.error
              }
        set((state) => {
          if (state.messages.some((m) => m.id === event.assistantMessageId)) {
            return { messages: applyToolEvent(state.messages, event.assistantMessageId, toolEvent) }
          }
          return {
            pendingToolEvents: {
              ...state.pendingToolEvents,
              [event.assistantMessageId]: [
                ...(state.pendingToolEvents[event.assistantMessageId] ?? []),
                toolEvent
              ]
            }
          }
        })
        break
      }
      case 'done': {
        set({ status: 'idle' })
        void get().refresh()
        // Delayed refresh to pick up AI-generated title from autoNameConversation
        setTimeout(() => void get().refresh(), 3000)
        break
      }
      case 'error': {
        set({ status: 'error', errorMessage: event.error })
        void get().refresh()
        break
      }
    }
  }
}))
