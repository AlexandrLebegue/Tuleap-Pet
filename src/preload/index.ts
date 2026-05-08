import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  ArtifactDetail,
  ArtifactSummary,
  ConnectionTestResult,
  Page,
  ProjectSummary,
  TrackerSummary
} from '@shared/types'

export type SettingsState = {
  tuleapUrl: string | null
  projectId: number | null
  hasToken: boolean
  secretStorageAvailable: boolean
}

const settings = {
  get: (): Promise<SettingsState> => ipcRenderer.invoke('settings:get'),
  setTuleapUrl: (url: string | null): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-tuleap-url', url),
  setToken: (token: string): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-token', token),
  clearToken: (): Promise<SettingsState> => ipcRenderer.invoke('settings:clear-token'),
  setProjectId: (id: number | null): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-project-id', id),
  reset: (): Promise<SettingsState> => ipcRenderer.invoke('settings:reset')
}

const tuleap = {
  testConnection: (): Promise<ConnectionTestResult> => ipcRenderer.invoke('tuleap:test-connection'),
  listProjects: (query?: string): Promise<ProjectSummary[]> =>
    ipcRenderer.invoke('tuleap:list-projects', query),
  listTrackers: (projectId?: number): Promise<TrackerSummary[]> =>
    ipcRenderer.invoke('tuleap:list-trackers', projectId),
  listArtifacts: (args: {
    trackerId: number
    limit?: number
    offset?: number
  }): Promise<Page<ArtifactSummary>> => ipcRenderer.invoke('tuleap:list-artifacts', args),
  getArtifact: (id: number): Promise<ArtifactDetail> => ipcRenderer.invoke('tuleap:get-artifact', id)
}

const api = { settings, tuleap }

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // Should never happen with sandbox: true + contextIsolation: true.
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

export type AppApi = typeof api
