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
  CommenterPRProgress,
  CommentingOptions,
  ConnectionTestResult,
  GenerationSource,
  GitBranch,
  GitCommit,
  GitRepository,
  JobStreamEvent,
  JobType,
  LlmProviderKind,
  MilestoneStatus,
  MilestoneSummary,
  Page,
  ProjectSummary,
  SprintContent,
  SprintReviewProgressEvent,
  SprintReviewSlideType,
  TrackerFields,
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
  chatbotExpertMode: boolean
  chatbotDoxygenMode: boolean
  chatbotToolsEnabled: boolean
  tempClonePath: string | null
  gitCloneSsh: boolean
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
  setChatbotExpertMode: (value: boolean): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-chatbot-expert-mode', value),
  setChatbotDoxygenMode: (value: boolean): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-chatbot-doxygen-mode', value),
  setChatbotToolsEnabled: (value: boolean): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-chatbot-tools-enabled', value),
  reset: (): Promise<SettingsState> => ipcRenderer.invoke('settings:reset'),
  setTempClonePath: (path: string | null): Promise<{ tempClonePath: string | null; gitCloneSsh: boolean }> =>
    ipcRenderer.invoke('settings:set-temp-clone-path', path),
  setGitCloneSsh: (value: boolean): Promise<{ tempClonePath: string | null; gitCloneSsh: boolean }> =>
    ipcRenderer.invoke('settings:set-git-clone-ssh', value),
  chooseTempDir: (): Promise<{ ok: true; path: string } | { ok: false; cancelled: true }> =>
    ipcRenderer.invoke('settings:choose-temp-dir')
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
  getArtifact: (id: number): Promise<ArtifactDetail> => ipcRenderer.invoke('tuleap:get-artifact', id),
  getTrackerFields: (trackerId: number): Promise<TrackerFields> =>
    ipcRenderer.invoke('tuleap:get-tracker-fields', { trackerId }),
  createArtifact: (args: {
    trackerId: number
    titleFieldId: number
    title: string
    statusFieldId?: number | null
    statusBindValueId?: number | null
    descriptionFieldId?: number | null
    description?: string | null
  }): Promise<ArtifactSummary> => ipcRenderer.invoke('tuleap:create-artifact', args),
  updateArtifactStatus: (args: {
    artifactId: number
    statusFieldId: number
    statusBindValueId: number
  }): Promise<{ ok: true }> => ipcRenderer.invoke('tuleap:update-artifact-status', args),
  updateArtifact: (args: {
    artifactId: number
    titleFieldId?: number | null
    title?: string | null
    descriptionFieldId?: number | null
    description?: string | null
    statusFieldId?: number | null
    statusBindValueId?: number | null
  }): Promise<{ ok: true }> => ipcRenderer.invoke('tuleap:update-artifact', args)
}

type LlmTestResult =
  | { ok: true; model: string; sample: string; provider: string }
  | { ok: false; error: string; kind: string; provider?: string; attemptedModel?: string; status?: number }

type GenerationResult = {
  markdown: string
  model: string
  finishReason: string | null
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null
  slideWarnings?: { slide: SprintReviewSlideType; warning: string }[]
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
    source: GenerationSource
    language?: 'fr' | 'en'
  }): Promise<GenerationResult> => ipcRenderer.invoke('generation:generate-sprint-review', args),
  listTrackerArtifacts: (trackerId: number): Promise<ArtifactSummary[]> =>
    ipcRenderer.invoke('generation:list-tracker-artifacts', trackerId),
  subscribeProgress: (handler: (event: SprintReviewProgressEvent) => void): (() => void) => {
    const wrapped = (_e: unknown, payload: SprintReviewProgressEvent): void => handler(payload)
    ipcRenderer.on('generation:progress', wrapped)
    return () => ipcRenderer.removeListener('generation:progress', wrapped)
  }
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
  sendMessage: (args: { conversationId: number; content: string; thinking?: boolean }): Promise<ChatSendResult> =>
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

export type CommenterFile = { name: string; content: string }
export type CommenterOptions = {
  preserveExisting: boolean
  addFileHeader: boolean
  detailedComments: boolean
  applyCodingRules: boolean
}
export type CommenterResult = { results: CommenterFile[]; errors: { name: string; error: string }[] }

const commenter = {
  process: (args: { files: CommenterFile[]; options: CommenterOptions }): Promise<CommenterResult> =>
    ipcRenderer.invoke('commenter:process', args),
  saveFile: (args: { filename: string; content: string }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('commenter:save-file', args),
  saveAll: (args: { files: CommenterFile[] }): Promise<{ ok: boolean; savedCount: number }> =>
    ipcRenderer.invoke('commenter:save-all', args)
}

export type CorrectorFile = { name: string; content: string }
export type CorrectorResult = {
  corrected: CorrectorFile[]
  summaries: { name: string; summary: string }[]
  errorAnalysis: string
}

const corrector = {
  analyze: (args: { errorContent: string }): Promise<{ analysis: string }> =>
    ipcRenderer.invoke('corrector:analyze', args),
  correct: (args: {
    files: CorrectorFile[]
    errorContent: string
    analysis: string
  }): Promise<CorrectorResult> => ipcRenderer.invoke('corrector:correct', args),
  saveFile: (args: { filename: string; content: string }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('corrector:save-file', args),
  saveAll: (args: { files: CorrectorFile[] }): Promise<{ ok: boolean; savedCount: number }> =>
    ipcRenderer.invoke('corrector:save-all', args)
}

export type ParsedFunction = {
  name: string
  signature: string
  lineNumber: number
  sourceCode: string
  parameters: { name: string; type: string }[]
  returnType: string
  description: string
}

export type TestGenResult = {
  testFiles: CommenterFile[]
  metrics: { apiCalls: number; testsGenerated: number; testsFailed: number; totalTime: number }
}

const testgen = {
  extractFunctions: (args: { filename: string; content: string }): Promise<{ functions: ParsedFunction[]; fileInfo: Record<string, unknown> }> =>
    ipcRenderer.invoke('testgen:extract-functions', args),
  generateAll: (args: { filename: string; content: string }): Promise<TestGenResult> =>
    ipcRenderer.invoke('testgen:generate-all', args),
  saveFile: (args: { filename: string; content: string }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('testgen:save-file', args),
  saveAll: (args: { files: CommenterFile[] }): Promise<{ ok: boolean; savedCount: number }> =>
    ipcRenderer.invoke('testgen:save-all', args)
}

const commenterPr = {
  listRepos: (): Promise<GitRepository[]> =>
    ipcRenderer.invoke('commenter-pr:list-repos'),

  listBranches: (repoId: number): Promise<GitBranch[]> =>
    ipcRenderer.invoke('commenter-pr:list-branches', repoId),

  chooseDir: (): Promise<{ ok: boolean; path?: string }> =>
    ipcRenderer.invoke('commenter-pr:choose-dir'),

  start: (args: {
    workDir: string
    repoId: number
    branch: string
    options: CommenterOptions
  }): Promise<{ ok: boolean; branchName?: string; prId?: number; prUrl?: string; error?: string }> =>
    ipcRenderer.invoke('commenter-pr:start', args),

  subscribe: (handler: (event: CommenterPRProgress) => void): (() => void) => {
    const wrapped = (_e: unknown, payload: CommenterPRProgress): void => handler(payload)
    ipcRenderer.on('commenter-pr:progress', wrapped)
    return () => ipcRenderer.removeListener('commenter-pr:progress', wrapped)
  }
}

const gitExplorer = {
  listRepos: (): Promise<GitRepository[]> =>
    ipcRenderer.invoke('git:list-repos'),

  listBranches: (repoId: number): Promise<GitBranch[]> =>
    ipcRenderer.invoke('git:list-branches', repoId),

  listCommits: (args: {
    repoId: number
    branchName: string
    offset?: number
  }): Promise<Page<GitCommit>> =>
    ipcRenderer.invoke('git:list-commits', args),

  startJob: (args: {
    repoId: number
    repoName: string
    cloneUrl: string
    branchName: string
    type: JobType
    options?: CommentingOptions
  }): Promise<{ jobId: string }> =>
    ipcRenderer.invoke('git:start-job', args),

  cancelJob: (jobId: string): Promise<void> =>
    ipcRenderer.invoke('git:cancel-job', jobId),

  subscribe: (handler: (event: JobStreamEvent) => void): (() => void) => {
    const wrapped = (_e: unknown, payload: JobStreamEvent): void => handler(payload)
    ipcRenderer.on('jobs:stream', wrapped)
    return () => ipcRenderer.removeListener('jobs:stream', wrapped)
  }
}

// ----- Phase 5-10 features -----

export type PendingWriteAction =
  | { kind: 'add_comment'; artifactId: number; comment: string; format?: 'text' | 'html' }
  | { kind: 'transition_status'; artifactId: number; newStatus: string }
  | { kind: 'create_artifact'; trackerId: number; title: string; description: string | null }
  | { kind: 'move_to_sprint'; artifactIds: number[]; milestoneId: number | null; fromMilestoneId?: number | null }
  | { kind: 'link_artifacts'; parentId: number; childIds: number[] }

const tuleapWrite = {
  apply: (
    action: PendingWriteAction
  ): Promise<{ ok: true; message: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('tuleap:apply-write', action)
}

const sprintBoard = {
  listOpenSprints: (): Promise<MilestoneSummary[]> => ipcRenderer.invoke('sprint:list-open'),
  getBoard: (args: {
    milestoneId: number | null
  }): Promise<{
    sprint: MilestoneSummary | null
    sprintItems: ArtifactSummary[]
    backlogItems: ArtifactSummary[]
    workflow: string[]
  }> => ipcRenderer.invoke('sprint:get-board', args),
  scanRisks: (
    args: { items: ArtifactSummary[] }
  ): Promise<{ ok: true; risks: Array<{ id: number; level: 'low' | 'medium' | 'high'; reason: string }> }> =>
    ipcRenderer.invoke('sprint:scan-risks', args)
}

const ticketBranch = {
  preview: (args: { artifactId: number }) =>
    ipcRenderer.invoke('ticket-branch:preview', args) as Promise<
      | { ok: true; branchName: string; commitMessage: string; prBody: string; contextMarkdown: string }
      | { ok: false; error: string }
    >,
  execute: (args: {
    artifactId: number
    repoPath: string
    baseBranch: string
    branchPrefix?: string
    pushImmediately?: boolean
    postComment?: boolean
    pushRemote?: string
  }) => ipcRenderer.invoke('ticket-branch:execute', args),
  chooseRepo: (): Promise<{ ok: true; path: string } | { ok: false; cancelled: true }> =>
    ipcRenderer.invoke('ticket-branch:choose-repo'),
  makeTempDir: (): Promise<{ ok: true; path: string }> =>
    ipcRenderer.invoke('ticket-branch:make-tempdir')
}

const prAc = {
  analyze: (args: { repoPath: string; baseBranch: string; headBranch: string; artifactIdHint?: number | null }) =>
    ipcRenderer.invoke('pr-ac:analyze', args),
  postComment: (args: { artifactId: number; markdown: string }) =>
    ipcRenderer.invoke('pr-ac:post-comment', args)
}

const rag = {
  index: () => ipcRenderer.invoke('rag:index'),
  search: (args: { query: string; limit?: number }) => ipcRenderer.invoke('rag:search', args),
  subscribeProgress: (handler: (payload: { done: number; total: number }) => void): (() => void) => {
    const wrapped = (_e: unknown, payload: { done: number; total: number }): void => handler(payload)
    ipcRenderer.on('rag:progress', wrapped)
    return () => ipcRenderer.removeListener('rag:progress', wrapped)
  }
}

const releaseNotes = {
  generate: (args: {
    repoPath: string
    fromRef: string
    toRef: string
    windowDays?: number
    artifactRefRegex?: string
  }) => ipcRenderer.invoke('release-notes:generate', args),
  listTags: (repoPath: string): Promise<string[]> =>
    ipcRenderer.invoke('release-notes:list-tags', repoPath)
}

const sprintPlanning = {
  propose: (args: { milestoneId: number; absencesNote?: string; capacityFactor?: number }) =>
    ipcRenderer.invoke('planning:propose', args)
}

const bugRepro = {
  generate: (args: { artifactId: number; repoPath: string; saveToFile?: boolean }) =>
    ipcRenderer.invoke('bug-repro:generate', args)
}

const traceability = {
  fileHistory: (args: { repoPath: string; filePath: string; refRegex?: string; limit?: number }) =>
    ipcRenderer.invoke('trace:file-history', args)
}

const api = {
  settings, tuleap, generation, marp, chat, auth, coder, admin, debug, commenter, corrector, testgen, commenterPr, gitExplorer,
  tuleapWrite, sprintBoard, ticketBranch, prAc, rag, releaseNotes, sprintPlanning, bugRepro, traceability
}

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
