import { create } from 'zustand'
import type {
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
  errorMessage: string | null
  unsubscribe: (() => void) | null

  init: () => void
  shutdown: () => void
  refresh: () => Promise<void>
  open: (id: number) => Promise<void>
  newConversation: () => Promise<void>
  rename: (id: number, title: string) => Promise<void>
  remove: (id: number) => Promise<void>
  setDraft: (text: string) => void
  send: () => Promise<void>
  handleEvent: (event: ChatStreamEvent) => void
}

function applyDelta(messages: ChatMessage[], id: number, delta: string): ChatMessage[] {
  return messages.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m))
}

function applyToolEvent(messages: ChatMessage[], id: number, event: ChatToolEvent): ChatMessage[] {
  return messages.map((m) =>
    m.id === id ? { ...m, toolEvents: [...(m.toolEvents ?? []), event] } : m
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
  errorMessage: null,
  unsubscribe: null,

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

  send: async () => {
    const { selectedId, draft } = get()
    if (!selectedId) return
    const trimmed = draft.trim()
    if (!trimmed) return
    set({ status: 'sending', draft: '', errorMessage: null })
    try {
      const result = await api.chat.sendMessage({ conversationId: selectedId, content: trimmed })
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
        // Reload from DB to pick up the freshly-inserted user + empty assistant rows.
        void api.chat.getConversation(event.conversationId).then((r) => {
          set({ messages: r.messages, status: 'streaming' })
        })
        break
      }
      case 'delta': {
        set((state) => ({
          messages: applyDelta(state.messages, event.assistantMessageId, event.delta)
        }))
        break
      }
      case 'tool-call': {
        set((state) => ({
          messages: applyToolEvent(state.messages, event.assistantMessageId, {
            kind: 'call',
            name: event.name,
            toolCallId: event.toolCallId,
            args: event.args
          })
        }))
        break
      }
      case 'tool-result': {
        set((state) => ({
          messages: applyToolEvent(state.messages, event.assistantMessageId, {
            kind: 'result',
            name: event.name,
            toolCallId: event.toolCallId,
            result: event.result,
            error: event.error
          })
        }))
        break
      }
      case 'done': {
        set({ status: 'idle' })
        void get().refresh()
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
