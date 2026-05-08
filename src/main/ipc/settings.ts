import { ipcMain } from 'electron'
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_OAUTH_SCOPE,
  clearConfig,
  getConfig,
  getLlmModel,
  getOAuthScope,
  setLlmModel,
  setProjectId,
  setTuleapUrl
} from '../store/config'
import {
  clearOAuthBundle,
  clearOpenRouterKey,
  clearTuleapToken,
  hasOAuthBundle,
  hasOpenRouterKey,
  hasTuleapToken,
  isOpenRouterKeyFromEnv,
  isSecretStorageAvailable,
  setOpenRouterKey,
  setTuleapToken
} from '../store/secrets'
import { audit } from '../store/db'

export type SettingsState = {
  tuleapUrl: string | null
  projectId: number | null
  hasToken: boolean
  secretStorageAvailable: boolean
  llmModel: string
  llmDefaultModel: string
  hasLlmKey: boolean
  llmKeyFromEnv: boolean
  authMode: 'token' | 'oauth2'
  oauthClientId: string | null
  oauthScope: string
  oauthDefaultScope: string
  hasOAuth: boolean
  openCodeBinary: string | null
}

function buildState(): SettingsState {
  const config = getConfig()
  return {
    tuleapUrl: config.tuleapUrl,
    projectId: config.projectId,
    hasToken: hasTuleapToken(),
    secretStorageAvailable: isSecretStorageAvailable(),
    llmModel: getLlmModel(),
    llmDefaultModel: DEFAULT_LLM_MODEL,
    hasLlmKey: hasOpenRouterKey(),
    llmKeyFromEnv: isOpenRouterKeyFromEnv(),
    authMode: config.authMode,
    oauthClientId: config.oauthClientId,
    oauthScope: getOAuthScope(),
    oauthDefaultScope: DEFAULT_OAUTH_SCOPE,
    hasOAuth: hasOAuthBundle(),
    openCodeBinary: config.openCodeBinary
  }
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => buildState())

  ipcMain.handle('settings:set-tuleap-url', (_event, url: unknown) => {
    if (url !== null && typeof url !== 'string') {
      throw new Error("Le paramètre 'url' doit être une chaîne ou null.")
    }
    const normalized = setTuleapUrl(url)
    audit('settings.set-tuleap-url', normalized ?? null)
    return buildState()
  })

  ipcMain.handle('settings:set-token', (_event, token: unknown) => {
    if (typeof token !== 'string' || token.trim().length === 0) {
      throw new Error('Token vide.')
    }
    setTuleapToken(token)
    audit('settings.set-token')
    return buildState()
  })

  ipcMain.handle('settings:clear-token', () => {
    clearTuleapToken()
    audit('settings.clear-token')
    return buildState()
  })

  ipcMain.handle('settings:set-project-id', (_event, id: unknown) => {
    if (id !== null && (typeof id !== 'number' || !Number.isInteger(id) || id <= 0)) {
      throw new Error("Le paramètre 'id' doit être un entier positif ou null.")
    }
    setProjectId(id as number | null)
    audit('settings.set-project-id', id === null ? null : String(id))
    return buildState()
  })

  ipcMain.handle('settings:set-llm-key', (_event, key: unknown) => {
    if (typeof key !== 'string' || key.trim().length === 0) {
      throw new Error('Clé OpenRouter vide.')
    }
    setOpenRouterKey(key)
    audit('settings.set-llm-key')
    return buildState()
  })

  ipcMain.handle('settings:clear-llm-key', () => {
    clearOpenRouterKey()
    audit('settings.clear-llm-key')
    return buildState()
  })

  ipcMain.handle('settings:set-llm-model', (_event, model: unknown) => {
    if (model !== null && typeof model !== 'string') {
      throw new Error("Le paramètre 'model' doit être une chaîne ou null.")
    }
    setLlmModel(model as string | null)
    audit('settings.set-llm-model', (model as string | null) ?? null)
    return buildState()
  })

  ipcMain.handle('settings:reset', () => {
    clearTuleapToken()
    clearOpenRouterKey()
    clearOAuthBundle()
    clearConfig()
    audit('settings.reset')
    return buildState()
  })
}
