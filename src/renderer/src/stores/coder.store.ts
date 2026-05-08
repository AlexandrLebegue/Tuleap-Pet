import { create } from 'zustand'
import type { ArtifactDetail, CoderStreamEvent } from '@shared/types'
import { api } from '@renderer/lib/api'

type Status = 'idle' | 'building' | 'ready' | 'running' | 'done' | 'error'

type Store = {
  artifactIdInput: string
  artifact: ArtifactDetail | null
  context: string
  status: Status
  buildError: string | null
  cwd: string | null
  binaryPath: string
  sessionId: string | null
  log: string
  exitCode: number | null
  unsubscribe: (() => void) | null

  init: (defaultBinary: string) => void
  shutdown: () => void
  setArtifactIdInput: (v: string) => void
  setContext: (v: string) => void
  setBinaryPath: (v: string) => void
  setCwd: (v: string | null) => void
  build: () => Promise<void>
  chooseCwd: () => Promise<void>
  run: () => Promise<void>
  kill: () => Promise<void>
  reset: () => void
  handleEvent: (event: CoderStreamEvent) => void
}

export const useCoder = create<Store>((set, get) => ({
  artifactIdInput: '',
  artifact: null,
  context: '',
  status: 'idle',
  buildError: null,
  cwd: null,
  binaryPath: 'opencode',
  sessionId: null,
  log: '',
  exitCode: null,
  unsubscribe: null,

  init: (defaultBinary: string) => {
    if (get().unsubscribe) return
    const off = api.coder.subscribe((event) => get().handleEvent(event))
    set({ unsubscribe: off, binaryPath: defaultBinary || 'opencode' })
  },

  shutdown: () => {
    const off = get().unsubscribe
    if (off) off()
    set({ unsubscribe: null })
  },

  setArtifactIdInput: (v: string) => set({ artifactIdInput: v }),
  setContext: (v: string) => set({ context: v }),
  setBinaryPath: (v: string) => set({ binaryPath: v }),
  setCwd: (v: string | null) => set({ cwd: v }),

  build: async () => {
    const id = Number.parseInt(get().artifactIdInput.trim(), 10)
    if (!Number.isInteger(id) || id <= 0) {
      set({ buildError: 'ID artéfact invalide.', status: 'error' })
      return
    }
    set({ status: 'building', buildError: null })
    try {
      const result = await api.coder.buildContext(id)
      set({
        artifact: result.artifact,
        context: result.contextMarkdown,
        status: 'ready'
      })
    } catch (err) {
      set({
        status: 'error',
        buildError: err instanceof Error ? err.message : String(err)
      })
    }
  },

  chooseCwd: async () => {
    const result = await api.coder.chooseCwd()
    if (result.ok && result.path) set({ cwd: result.path })
  },

  run: async () => {
    const { context, binaryPath, cwd } = get()
    if (!context.trim()) return
    set({ status: 'running', log: '', exitCode: null, sessionId: null })
    await api.coder.setBinary(binaryPath || null)
    const result = await api.coder.run({
      prompt: context,
      binaryPath: binaryPath || null,
      cwd: cwd ?? null
    })
    if (!result.ok) {
      set({ status: 'error', log: result.error, sessionId: null })
    } else {
      set({ sessionId: result.sessionId })
    }
  },

  kill: async () => {
    const id = get().sessionId
    if (!id) return
    await api.coder.kill(id)
  },

  reset: () =>
    set({
      artifactIdInput: '',
      artifact: null,
      context: '',
      status: 'idle',
      buildError: null,
      sessionId: null,
      log: '',
      exitCode: null
    }),

  handleEvent: (event: CoderStreamEvent) => {
    if (event.type === 'started') {
      set((state) => ({
        log: state.log + `$ ${event.command}\n(cwd ${event.cwd}, pid ${event.pid})\n\n`,
        status: 'running'
      }))
    } else if (event.type === 'stdout' || event.type === 'stderr') {
      set((state) => ({ log: state.log + event.chunk }))
    } else if (event.type === 'exit') {
      set((state) => ({
        log: state.log + `\n[exit ${event.code ?? 'null'}${event.signal ? ` (${event.signal})` : ''}]\n`,
        exitCode: event.code,
        status: event.code === 0 ? 'done' : 'error',
        sessionId: null
      }))
    } else if (event.type === 'error') {
      set((state) => ({
        log: state.log + `\n[erreur] ${event.error}\n`,
        status: 'error',
        sessionId: null
      }))
    }
  }
}))
