import { ipcMain } from 'electron'
import { getConfig, setProjectId, setTuleapUrl, clearConfig } from '../store/config'
import {
  clearTuleapToken,
  hasTuleapToken,
  isSecretStorageAvailable,
  setTuleapToken
} from '../store/secrets'
import { audit } from '../store/db'

export type SettingsState = {
  tuleapUrl: string | null
  projectId: number | null
  hasToken: boolean
  secretStorageAvailable: boolean
}

function buildState(): SettingsState {
  const config = getConfig()
  return {
    tuleapUrl: config.tuleapUrl,
    projectId: config.projectId,
    hasToken: hasTuleapToken(),
    secretStorageAvailable: isSecretStorageAvailable()
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

  ipcMain.handle('settings:reset', () => {
    clearTuleapToken()
    clearConfig()
    audit('settings.reset')
    return buildState()
  })
}
