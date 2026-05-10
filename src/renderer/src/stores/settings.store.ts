import { create } from 'zustand'
import type { ConnectionTestResult, LlmProviderKind, ProjectSummary } from '@shared/types'
import { api } from '@renderer/lib/api'
import type { SettingsState } from '../../../preload'

type ConnectionStatus = 'unknown' | 'testing' | 'ok' | 'error'

type LlmTestResult =
  | { ok: true; model: string; sample: string; provider: string }
  | { ok: false; error: string; kind: string; provider?: string; attemptedModel?: string; status?: number }

type Store = {
  config: SettingsState
  status: ConnectionStatus
  lastResult: ConnectionTestResult | null
  projects: ProjectSummary[]
  loadingProjects: boolean

  llmStatus: ConnectionStatus
  llmLastResult: LlmTestResult | null

  refresh: () => Promise<void>
  testConnection: () => Promise<ConnectionTestResult>
  setUrl: (url: string) => Promise<void>
  setToken: (token: string) => Promise<void>
  clearToken: () => Promise<void>
  loadProjects: () => Promise<void>
  setProjectId: (id: number | null) => Promise<void>

  setLlmProvider: (provider: LlmProviderKind) => Promise<void>
  setLlmKey: (key: string) => Promise<void>
  clearLlmKey: () => Promise<void>
  setLlmModel: (model: string | null) => Promise<void>
  setLocalBaseUrl: (url: string | null) => Promise<void>
  setLocalModel: (model: string | null) => Promise<void>
  setLocalKey: (key: string) => Promise<void>
  clearLocalKey: () => Promise<void>
  setLocalDirectConnection: (value: boolean) => Promise<void>
  testLlm: () => Promise<LlmTestResult>

  setAuthMode: (mode: 'token' | 'oauth2') => Promise<void>
  setOAuthClient: (clientId: string | null, scope: string | null) => Promise<void>
  startOAuth: () => Promise<{ ok: boolean; error?: string }>
  clearOAuth: () => Promise<void>
  setChatbotExpertMode: (value: boolean) => Promise<void>
  setChatbotDoxygenMode: (value: boolean) => Promise<void>
  setChatbotToolsEnabled: (value: boolean) => Promise<void>
}

const emptyConfig: SettingsState = {
  tuleapUrl: null,
  projectId: null,
  hasToken: false,
  secretStorageAvailable: true,
  llmProvider: 'openrouter',
  llmModel: 'minimax/minimax-m2:free',
  llmDefaultModel: 'minimax/minimax-m2:free',
  hasLlmKey: false,
  llmKeyFromEnv: false,
  localBaseUrl: null,
  localModel: null,
  hasLocalKey: false,
  localKeyFromEnv: false,
  localDirectConnection: true,
  authMode: 'token',
  oauthClientId: null,
  oauthScope: 'read:user_membership read:project read:tracker',
  oauthDefaultScope: 'read:user_membership read:project read:tracker',
  hasOAuth: false,
  openCodeBinary: null,
  chatbotExpertMode: false,
  chatbotDoxygenMode: false,
  chatbotToolsEnabled: true,
  tempClonePath: null,
  gitCloneSsh: true
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
  },

  llmStatus: 'unknown',
  llmLastResult: null,

  setLlmProvider: async (provider) => {
    const config = await api.settings.setLlmProvider(provider)
    set({ config, llmStatus: 'unknown', llmLastResult: null })
  },

  setLlmKey: async (key: string) => {
    const config = await api.settings.setLlmKey(key)
    set({ config, llmStatus: 'unknown', llmLastResult: null })
  },

  clearLlmKey: async () => {
    const config = await api.settings.clearLlmKey()
    set({ config, llmStatus: 'unknown', llmLastResult: null })
  },

  setLlmModel: async (model: string | null) => {
    const config = await api.settings.setLlmModel(model)
    set({ config, llmStatus: 'unknown', llmLastResult: null })
  },

  setLocalBaseUrl: async (url) => {
    const config = await api.settings.setLocalBaseUrl(url)
    set({ config, llmStatus: 'unknown', llmLastResult: null })
  },

  setLocalModel: async (model) => {
    const config = await api.settings.setLocalModel(model)
    set({ config, llmStatus: 'unknown', llmLastResult: null })
  },

  setLocalKey: async (key) => {
    const config = await api.settings.setLocalKey(key)
    set({ config, llmStatus: 'unknown', llmLastResult: null })
  },

  clearLocalKey: async () => {
    const config = await api.settings.clearLocalKey()
    set({ config, llmStatus: 'unknown', llmLastResult: null })
  },

  setLocalDirectConnection: async (value: boolean) => {
    const config = await api.settings.setLocalDirectConnection(value)
    set({ config, llmStatus: 'unknown', llmLastResult: null })
  },

  testLlm: async () => {
    const cfg = get().config
    if (cfg.llmProvider === 'openrouter' && !cfg.hasLlmKey) {
      const result: LlmTestResult = {
        ok: false,
        kind: 'auth',
        error: 'Aucune clé OpenRouter enregistrée.',
        provider: 'openrouter'
      }
      set({ llmStatus: 'error', llmLastResult: result })
      return result
    }
    if (cfg.llmProvider === 'local') {
      if (!cfg.localBaseUrl) {
        const result: LlmTestResult = {
          ok: false,
          kind: 'auth',
          error: 'Aucune URL de base configurée pour le modèle local. Renseignez-la dans Réglages.',
          provider: 'local'
        }
        set({ llmStatus: 'error', llmLastResult: result })
        return result
      }
      if (!cfg.localModel) {
        const result: LlmTestResult = {
          ok: false,
          kind: 'auth',
          error: 'Aucun modèle local configuré. Renseignez-le dans Réglages.',
          provider: 'local'
        }
        set({ llmStatus: 'error', llmLastResult: result })
        return result
      }
    }
    set({ llmStatus: 'testing' })
    const result = await api.generation.testLlm()
    set({ llmStatus: result.ok ? 'ok' : 'error', llmLastResult: result })
    return result
  },

  setAuthMode: async (mode: 'token' | 'oauth2') => {
    await api.auth.setMode(mode)
    await get().refresh()
    set({ status: 'unknown', lastResult: null })
  },

  setOAuthClient: async (clientId: string | null, scope: string | null) => {
    await api.auth.setOAuthClient({ clientId, scope })
    await get().refresh()
  },

  startOAuth: async () => {
    const result = await api.auth.startOAuth()
    await get().refresh()
    if (!result.ok) return { ok: false, error: result.error }
    set({ status: 'unknown', lastResult: null })
    return { ok: true }
  },

  clearOAuth: async () => {
    await api.auth.clearOAuth()
    await get().refresh()
  },

  setChatbotExpertMode: async (value: boolean) => {
    const config = await api.settings.setChatbotExpertMode(value)
    set({ config })
  },

  setChatbotDoxygenMode: async (value: boolean) => {
    const config = await api.settings.setChatbotDoxygenMode(value)
    set({ config })
  },

  setChatbotToolsEnabled: async (value: boolean) => {
    const config = await api.settings.setChatbotToolsEnabled(value)
    set({ config })
  }
}))
