import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  ArtifactDetail,
  ArtifactSummary,
  ChatConversation,
  ChatMessage,
  ChatStreamEvent,
  ConnectionTestResult,
  MilestoneStatus,
  MilestoneSummary,
  Page,
  ProjectSummary,
  SprintContent,
  TrackerSummary
} from '@shared/types'

export type SettingsState = {
  tuleapUrl: string | null
  projectId: number | null
  hasToken: boolean
  secretStorageAvailable: boolean
  llmModel: string
  llmDefaultModel: string
  hasLlmKey: boolean
  llmKeyFromEnv: boolean
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
  setLlmKey: (key: string): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-llm-key', key),
  clearLlmKey: (): Promise<SettingsState> => ipcRenderer.invoke('settings:clear-llm-key'),
  setLlmModel: (model: string | null): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-llm-model', model),
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

type LlmTestResult =
  | { ok: true; model: string; sample: string }
  | { ok: false; error: string; kind: string }

type GenerationResult = {
  markdown: string
  model: string
  finishReason: string | null
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null
}

type MarpExportResult =
  | { ok: true; outputPath: string }
  | { ok: false; cancelled: true }
  | { ok: false; error: string }

const generation = {
  listSprints: (status?: MilestoneStatus): Promise<MilestoneSummary[]> =>
    ipcRenderer.invoke('generation:list-sprints', status),
  getSprintContent: (milestoneId: number): Promise<SprintContent> =>
    ipcRenderer.invoke('generation:get-sprint-content', milestoneId),
  testLlm: (): Promise<LlmTestResult> => ipcRenderer.invoke('generation:test-llm'),
  generateSprintReview: (args: {
    milestoneId: number
    language?: 'fr' | 'en'
  }): Promise<GenerationResult> => ipcRenderer.invoke('generation:generate-sprint-review', args)
}

const marp = {
  renderPreview: (markdown: string): Promise<{ html: string }> =>
    ipcRenderer.invoke('marp:render-preview', markdown),
  exportPptx: (args: { markdown: string; suggestedName?: string }): Promise<MarpExportResult> =>
    ipcRenderer.invoke('marp:export-pptx', args)
}

type ChatSendResult =
  | { ok: true; assistantMessageId: number }
  | { ok: false; error: string; kind: string; assistantMessageId: number }

const chat = {
  listConversations: (): Promise<ChatConversation[]> => ipcRenderer.invoke('chat:list-conversations'),
  getConversation: (
    id: number
  ): Promise<{ conversation: ChatConversation; messages: ChatMessage[] }> =>
    ipcRenderer.invoke('chat:get-conversation', id),
  createConversation: (args?: {
    title?: string
    projectId?: number | null
  }): Promise<ChatConversation> => ipcRenderer.invoke('chat:create-conversation', args),
  renameConversation: (id: number, title: string): Promise<ChatConversation | null> =>
    ipcRenderer.invoke('chat:rename-conversation', { id, title }),
  deleteConversation: (id: number): Promise<{ ok: true }> =>
    ipcRenderer.invoke('chat:delete-conversation', id),
  sendMessage: (args: { conversationId: number; content: string }): Promise<ChatSendResult> =>
    ipcRenderer.invoke('chat:send-message', args),
  /** Subscribe to streaming events; returns an unsubscribe function. */
  subscribe: (handler: (event: ChatStreamEvent) => void): (() => void) => {
    const wrapped = (_e: unknown, payload: ChatStreamEvent): void => handler(payload)
    ipcRenderer.on('chat:stream', wrapped)
    return () => ipcRenderer.removeListener('chat:stream', wrapped)
  }
}

const api = { settings, tuleap, generation, marp, chat }

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
