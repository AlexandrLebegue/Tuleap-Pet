import { create } from 'zustand'
import type { ConnectionTestResult, ProjectSummary } from '@shared/types'
import { api } from '@renderer/lib/api'
import type { SettingsState } from '../../../preload'

type ConnectionStatus = 'unknown' | 'testing' | 'ok' | 'error'

type Store = {
  config: SettingsState
  status: ConnectionStatus
  lastResult: ConnectionTestResult | null
  projects: ProjectSummary[]
  loadingProjects: boolean
  refresh: () => Promise<void>
  testConnection: () => Promise<ConnectionTestResult>
  setUrl: (url: string) => Promise<void>
  setToken: (token: string) => Promise<void>
  clearToken: () => Promise<void>
  loadProjects: () => Promise<void>
  setProjectId: (id: number | null) => Promise<void>
}

const emptyConfig: SettingsState = {
  tuleapUrl: null,
  projectId: null,
  hasToken: false,
  secretStorageAvailable: true
}

export const useSettings = create<Store>((set, get) => ({
  config: emptyConfig,
  status: 'unknown',
  lastResult: null,
  projects: [],
  loadingProjects: false,

  refresh: async () => {
    const config = await api.settings.get()
    set({ config })
  },

  testConnection: async () => {
    if (!get().config.tuleapUrl || !get().config.hasToken) {
      const result: ConnectionTestResult = {
        ok: false,
        kind: 'unknown',
        error: 'URL ou token manquant.'
      }
      set({ status: 'error', lastResult: result })
      return result
    }
    set({ status: 'testing' })
    const result = await api.tuleap.testConnection()
    set({ status: result.ok ? 'ok' : 'error', lastResult: result })
    return result
  },

  setUrl: async (url: string) => {
    const config = await api.settings.setTuleapUrl(url || null)
    set({ config, status: 'unknown', lastResult: null })
  },

  setToken: async (token: string) => {
    const config = await api.settings.setToken(token)
    set({ config, status: 'unknown', lastResult: null })
  },

  clearToken: async () => {
    const config = await api.settings.clearToken()
    set({ config, status: 'unknown', lastResult: null, projects: [] })
  },

  loadProjects: async () => {
    set({ loadingProjects: true })
    try {
      const projects = await api.tuleap.listProjects()
      set({ projects, loadingProjects: false })
    } catch (err) {
      set({ loadingProjects: false })
      throw err
    }
  },

  setProjectId: async (id: number | null) => {
    const config = await api.settings.setProjectId(id)
    set({ config })
  }
}))
