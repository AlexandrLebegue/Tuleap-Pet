import { contextBridge, ipcRenderer } from 'electron'
import type {
  AdminScanResult,
  ArtifactDetail,
  ArtifactSummary,
  ChatConversation,
  ChatMessage,
  ChatStreamEvent,
  CoderContextResult,
  CoderStreamEvent,
  ConnectionTestResult,
  LlmProviderKind,
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
  llmProvider: LlmProviderKind
  llmModel: string
  llmDefaultModel: string
  hasLlmKey: boolean
  llmKeyFromEnv: boolean
  localBaseUrl: string | null
  localModel: string | null
  hasLocalKey: boolean
  localKeyFromEnv: boolean
  localDirectConnection: boolean
  authMode: 'token' | 'oauth2'
  oauthClientId: string | null
  oauthScope: string
  oauthDefaultScope: string
  hasOAuth: boolean
  openCodeBinary: string | null
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
  setLlmProvider: (provider: LlmProviderKind): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-llm-provider', provider),
  setLlmKey: (key: string): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-llm-key', key),
  clearLlmKey: (): Promise<SettingsState> => ipcRenderer.invoke('settings:clear-llm-key'),
  setLlmModel: (model: string | null): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-llm-model', model),
  setLocalBaseUrl: (url: string | null): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-local-base-url', url),
  setLocalModel: (model: string | null): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-local-model', model),
  setLocalKey: (key: string): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-local-key', key),
  clearLocalKey: (): Promise<SettingsState> => ipcRenderer.invoke('settings:clear-local-key'),
  setLocalDirectConnection: (value: boolean): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-local-direct-connection', value),
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
  | { ok: true; model: string; sample: string; provider: string }
  | { ok: false; error: string; kind: string; provider?: string; attemptedModel?: string; status?: number }

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

type StartOAuthResult =
  | { ok: true; scope: string | null; expiresAt: number | null }
  | { ok: false; error: string }

const auth = {
  setMode: (mode: 'token' | 'oauth2'): Promise<{ ok: true }> =>
    ipcRenderer.invoke('auth:set-mode', mode),
  setOAuthClient: (args: { clientId: string | null; scope: string | null }): Promise<{ ok: true }> =>
    ipcRenderer.invoke('auth:set-oauth-client', args),
  startOAuth: (): Promise<StartOAuthResult> => ipcRenderer.invoke('auth:start-oauth'),
  clearOAuth: (): Promise<{ ok: true }> => ipcRenderer.invoke('auth:clear-oauth'),
  hasOAuth: (): Promise<{ hasOAuth: boolean }> => ipcRenderer.invoke('auth:has-oauth')
}

const coder = {
  buildContext: (artifactId: number): Promise<CoderContextResult> =>
    ipcRenderer.invoke('coder:build-context', artifactId),
  setBinary: (path: string | null): Promise<{ ok: true; path: string | null }> =>
    ipcRenderer.invoke('coder:set-binary', { path }),
  chooseCwd: (): Promise<{ ok: true; path: string | null } | { ok: false; cancelled: true }> =>
    ipcRenderer.invoke('coder:choose-cwd'),
  run: (args: {
    prompt: string
    cwd?: string | null
    binaryPath?: string | null
    extraArgs?: string[]
  }): Promise<{ ok: true; sessionId: string; pid: number } | { ok: false; error: string }> =>
    ipcRenderer.invoke('coder:run', args),
  kill: (sessionId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('coder:kill', sessionId),
  subscribe: (handler: (event: CoderStreamEvent) => void): (() => void) => {
    const wrapped = (_e: unknown, payload: CoderStreamEvent): void => handler(payload)
    ipcRenderer.on('coder:stream', wrapped)
    return () => ipcRenderer.removeListener('coder:stream', wrapped)
  }
}

export type DebugLogEntry = {
  id: number
  level: 'log' | 'warn' | 'error'
  ts: number
  message: string
}

const debug = {
  subscribe: (handler: (entry: DebugLogEntry) => void): (() => void) => {
    const wrapped = (_e: unknown, payload: DebugLogEntry): void => handler(payload)
    ipcRenderer.on('debug:log', wrapped)
    return () => ipcRenderer.removeListener('debug:log', wrapped)
  }
}

type AdminSummaryResult =
  | { ok: true; markdown: string; model: string; usage: { totalTokens?: number } | null }
  | { ok: false; error: string; kind: string }

const admin = {
  scan: (args?: { windowDays?: number }): Promise<AdminScanResult> =>
    ipcRenderer.invoke('admin:scan', args),
  summarize: (scan: AdminScanResult): Promise<AdminSummaryResult> =>
    ipcRenderer.invoke('admin:summarize', scan)
}

const api = { settings, tuleap, generation, marp, chat, auth, coder, admin, debug }

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('Failed to expose app API:', error)
  }
} else {
  // Should never happen with sandbox: true + contextIsolation: true.
  // @ts-ignore (define in dts)
  window.api = api
}

export type AppApi = typeof api
