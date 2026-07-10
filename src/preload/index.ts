import { contextBridge, ipcRenderer } from 'electron'
import type {
  AdminScanResult,
  ArtifactDetail,
  ArtifactSummary,
  ChatAttachment,
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
  SvnRepository,
  SvnPathEntry,
  SvnCommit,
  SvnPatchResult,
  BranchCompareResult,
  DetailedSummaryRequest,
  SummaryDiagnostics,
  HeaderEntry,
  HeaderIndexResult,
  JenkinsBranchStatus,
  JenkinsBranchTestReport,
  JenkinsBuildDetail,
  JenkinsBuildSummary,
  JenkinsConnectionTestResult,
  JenkinsCoverageReport,
  JenkinsDiscoverResult,
  JenkinsFailureAnalysis,
  JenkinsJob,
  JenkinsNode,
  JenkinsQueueItem,
  JenkinsTtmExportProgress,
  JenkinsTtmExportResult,
  JenkinsValidateResult,
  JenkinsWarningsReport,
  JobStreamEvent,
  JobType,
  LlmProviderKind,
  MilestoneStatus,
  MilestoneSummary,
  Page,
  ProjectSummary,
  SprintContent,
  TestGenSelection,
  CommentTarget,
  WarningCorrectorJobOptions,
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
  chatbotJenkinsToolsEnabled: boolean
  tempClonePath: string | null
  gitCloneSsh: boolean
  svnPath: string | null
  jenkinsUrl: string | null
  jenkinsUser: string | null
  jenkinsDiscoveryFolder: string | null
  hasJenkinsToken: boolean
  ttmTrackerId: number | null
  jenkinsRepoMapping: Record<string, string[]> | null
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
  setChatbotJenkinsToolsEnabled: (value: boolean): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-chatbot-jenkins-tools-enabled', value),
  reset: (): Promise<SettingsState> => ipcRenderer.invoke('settings:reset'),
  setTempClonePath: (
    path: string | null
  ): Promise<{ tempClonePath: string | null; gitCloneSsh: boolean }> =>
    ipcRenderer.invoke('settings:set-temp-clone-path', path),
  setGitCloneSsh: (
    value: boolean
  ): Promise<{ tempClonePath: string | null; gitCloneSsh: boolean }> =>
    ipcRenderer.invoke('settings:set-git-clone-ssh', value),
  chooseTempDir: (): Promise<{ ok: true; path: string } | { ok: false; cancelled: true }> =>
    ipcRenderer.invoke('settings:choose-temp-dir'),
  setSvnPath: (path: string | null): Promise<{ svnPath: string | null }> =>
    ipcRenderer.invoke('settings:set-svn-path', path),
  chooseSvnBinary: (): Promise<{ ok: true; path: string } | { ok: false; cancelled: true }> =>
    ipcRenderer.invoke('settings:choose-svn-binary'),
  setJenkinsUrl: (url: string | null): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-jenkins-url', url),
  setJenkinsUser: (user: string | null): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-jenkins-user', user),
  setJenkinsToken: (token: string): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-jenkins-token', token),
  clearJenkinsToken: (): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:clear-jenkins-token'),
  setJenkinsDiscoveryFolder: (folder: string | null): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-jenkins-discovery-folder', folder),
  setJenkinsRepoMapping: (mapping: Record<string, string[]> | null): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:set-jenkins-repo-mapping', mapping),
  setTtmTrackerId: (id: number | null): Promise<{ ttmTrackerId: number | null }> =>
    ipcRenderer.invoke('settings:set-ttm-tracker-id', id)
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
  getArtifact: (id: number): Promise<ArtifactDetail> =>
    ipcRenderer.invoke('tuleap:get-artifact', id),
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
  | {
      ok: false
      error: string
      kind: string
      provider?: string
      attemptedModel?: string
      status?: number
    }

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
    storySlides?: boolean
    theme?: 'light' | 'dark'
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
  listConversations: (): Promise<ChatConversation[]> =>
    ipcRenderer.invoke('chat:list-conversations'),
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
  sendMessage: (args: {
    conversationId: number
    content: string
    thinking?: boolean
    attachments?: ChatAttachment[]
  }): Promise<ChatSendResult> => ipcRenderer.invoke('chat:send-message', args),
  /** Opens the OS file picker and extracts text from the selected documents. */
  pickAttachments: (): Promise<{ attachments: ChatAttachment[]; errors: string[] }> =>
    ipcRenderer.invoke('chat:pick-attachments'),
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
  setOAuthClient: (args: {
    clientId: string | null
    scope: string | null
  }): Promise<{ ok: true }> => ipcRenderer.invoke('auth:set-oauth-client', args),
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
export type CommenterOptions = CommentingOptions
export type CommenterResult = {
  results: CommenterFile[]
  errors: { name: string; error: string }[]
}

export type CommenterContextProgress =
  | { type: 'index'; root: string }
  | { type: 'file-start'; filePath: string; total: number; functions: number }
  | { type: 'evaluate'; filePath: string; functionName: string; index: number; total: number }
  | { type: 'verdict'; functionName: string; sufficient: boolean; reason: string }
  | { type: 'generate'; functionName: string }
  | { type: 'file-done'; filePath: string; skipped: number; commented: number }
  | { type: 'done' }

export type CommenterContextResult = {
  files: {
    filePath: string
    originalContent: string
    newContent: string
    plans: {
      fn: { name: string; qualifiedName: string; startLine: number; endLine: number }
      evaluation: { sufficient: boolean; reason: string }
      newComment?: string
    }[]
    skipped: number
    commented: number
  }[]
  warnings: string[]
}

const commenter = {
  process: (args: {
    files: CommenterFile[]
    options: CommenterOptions
  }): Promise<CommenterResult> => ipcRenderer.invoke('commenter:process', args),
  saveFile: (args: { filename: string; content: string }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('commenter:save-file', args),
  saveAll: (args: { files: CommenterFile[] }): Promise<{ ok: boolean; savedCount: number }> =>
    ipcRenderer.invoke('commenter:save-all', args),
  resolveSources: (args: {
    filenames: string[]
  }): Promise<{ ok: true; resolved: Record<string, string[]> } | { ok: false; reason: string }> =>
    ipcRenderer.invoke('commenter:resolve-sources', args),
  scanFolder: (args: {
    folderPath: string
  }): Promise<{ ok: true; filePaths: string[]; count: number } | { ok: false; reason: string }> =>
    ipcRenderer.invoke('commenter:scan-folder', args),
  runContext: (args: {
    filePaths: string[]
    forceAll?: boolean
    depth?: number
    tokenBudget?: number
    projectRootOverride?: string
  }): Promise<CommenterContextResult> => ipcRenderer.invoke('commenter:run-context', args),
  subscribeContext: (handler: (event: CommenterContextProgress) => void): (() => void) => {
    const wrapped = (_e: unknown, payload: CommenterContextProgress): void => handler(payload)
    ipcRenderer.on('commenter:context-progress', wrapped)
    return () => ipcRenderer.removeListener('commenter:context-progress', wrapped)
  }
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

export type TestgenPipelineProgress =
  | { type: 'index'; root: string }
  | { type: 'discover'; testDir: string | null; templateFile: string | null; marker: string | null }
  | { type: 'generate'; functionName: string; index: number; total: number }
  | { type: 'write'; filePath: string }
  | { type: 'cmake-update'; cmakeFile: string; inserted: string[] }
  | { type: 'build-start'; preset: string; iteration: number }
  | { type: 'build-result'; ok: boolean; iteration: number; durationMs: number }
  | { type: 'repair'; iteration: number; failingFiles: string[] }
  | { type: 'done' }

export type TestgenPipelineResult = {
  testFiles: { filePath: string; functionName: string; content: string; iteration: number }[]
  discovery: {
    testDir: string | null
    templateFile: string | null
    hits: { filePath: string; markers: string; score: number }[]
    marker: string | null
  }
  cmakeFile: string | null
  cmakeInserted: string[]
  build: {
    ok: boolean
    exitCode: number | null
    stdout: string
    stderr: string
    errors: { filePath?: string; line?: number; column?: number; message: string }[]
    durationMs: number
    command: string
  } | null
  iterations: number
  warnings: string[]
}

const testgen = {
  extractFunctions: (args: {
    filename: string
    content: string
  }): Promise<{ functions: ParsedFunction[]; fileInfo: Record<string, unknown> }> =>
    ipcRenderer.invoke('testgen:extract-functions', args),
  generateAll: (args: {
    filename: string
    content: string
    onlyFunctions?: string[]
    sourceFilePath?: string
  }): Promise<TestGenResult> => ipcRenderer.invoke('testgen:generate-all', args),
  saveFile: (args: { filename: string; content: string }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('testgen:save-file', args),
  saveAll: (args: { files: CommenterFile[] }): Promise<{ ok: boolean; savedCount: number }> =>
    ipcRenderer.invoke('testgen:save-all', args),
  resolveSource: (args: {
    filename: string
  }): Promise<{ ok: true; candidates: string[] } | { ok: false; reason: string }> =>
    ipcRenderer.invoke('testgen:resolve-source', args),
  runPipeline: (args: {
    sourceFilePath: string
    onlyFunctions?: string[]
    buildEnabled: boolean
    preset?: string
    maxRepairs?: number
  }): Promise<TestgenPipelineResult> => ipcRenderer.invoke('testgen:run-pipeline', args),
  subscribePipeline: (handler: (event: TestgenPipelineProgress) => void): (() => void) => {
    const wrapped = (_e: unknown, payload: TestgenPipelineProgress): void => handler(payload)
    ipcRenderer.on('testgen:pipeline-progress', wrapped)
    return () => ipcRenderer.removeListener('testgen:pipeline-progress', wrapped)
  },

  // Source input: git repo mode
  gitCloneAndList: (args: {
    repoUrl: string
    branch: string
    onlyRecentFiles: boolean
  }): Promise<{ ok: true; cloneDir: string; files: string[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('testgen:git-clone-and-list', args),

  buildHeaderIndex: (args: { cloneDir: string }): Promise<HeaderIndexResult> =>
    ipcRenderer.invoke('testgen:build-header-index', args),

  cleanupCloneDir: (args: { cloneDir: string }): Promise<void> =>
    ipcRenderer.invoke('testgen:cleanup-clone-dir', args),

  readFileFromDir: (args: {
    cloneDir: string
    relativePath: string
  }): Promise<{ ok: true; content: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('testgen:read-file-from-dir', args),

  // Source input: local folder mode
  listFolderFiles: (args: {
    folderPath: string
  }): Promise<{ ok: true; files: string[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('testgen:list-folder-files', args),

  chooseFolderForSource: (): Promise<{ ok: true; path: string } | { ok: false; cancelled: true }> =>
    ipcRenderer.invoke('testgen:choose-folder-for-source')
}

const commenterPr = {
  listRepos: (): Promise<GitRepository[]> => ipcRenderer.invoke('commenter-pr:list-repos'),

  listBranches: (repoId: number): Promise<GitBranch[]> =>
    ipcRenderer.invoke('commenter-pr:list-branches', repoId),

  chooseDir: (): Promise<{ ok: boolean; path?: string }> =>
    ipcRenderer.invoke('commenter-pr:choose-dir'),

  start: (args: {
    workDir: string
    repoId: number
    branch: string
    options: CommentingOptions
  }): Promise<{
    ok: boolean
    branchName?: string
    prId?: number
    prUrl?: string
    error?: string
  }> => ipcRenderer.invoke('commenter-pr:start', args),

  subscribe: (handler: (event: CommenterPRProgress) => void): (() => void) => {
    const wrapped = (_e: unknown, payload: CommenterPRProgress): void => handler(payload)
    ipcRenderer.on('commenter-pr:progress', wrapped)
    return () => ipcRenderer.removeListener('commenter-pr:progress', wrapped)
  }
}

const gitExplorer = {
  listRepos: (): Promise<GitRepository[]> => ipcRenderer.invoke('git:list-repos'),

  listBranches: (repoId: number): Promise<GitBranch[]> =>
    ipcRenderer.invoke('git:list-branches', repoId),

  listCommits: (args: {
    repoId: number
    branchName: string
    offset?: number
  }): Promise<Page<GitCommit>> => ipcRenderer.invoke('git:list-commits', args),

  cloneAndList: (args: {
    repoName: string
    cloneUrl: string
    branchName: string
  }): Promise<
    | { ok: true; cloneDir: string; files: string[]; changedFiles: string[] }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('git:clone-and-list', args),

  cleanupClone: (dir: string): Promise<void> => ipcRenderer.invoke('git:cleanup-clone', dir),

  detectCompileScript: (args: {
    cloneDir: string
  }): Promise<{ found: boolean; scripts: string[] }> =>
    ipcRenderer.invoke('git:detect-compile-script', args),

  writeCompileScript: (args: {
    cloneDir: string
    filename?: string
    content: string
  }): Promise<{ ok: true; path: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('git:write-compile-script', args),

  startJob: (args: {
    repoId: number
    repoName: string
    cloneUrl: string
    branchName: string
    type: JobType
    options?: CommentingOptions
    selection?: TestGenSelection[]
    selectedFiles?: string[]
    commentTargets?: CommentTarget[]
    warningOptions?: WarningCorrectorJobOptions
    existingCloneDir?: string
  }): Promise<{ jobId: string }> => ipcRenderer.invoke('git:start-job', args),

  cancelJob: (jobId: string): Promise<void> => ipcRenderer.invoke('git:cancel-job', jobId),

  compareBranches: (args: {
    repoName: string
    cloneUrl: string
    base: string
    compare: string
  }): Promise<{ ok: true; result: BranchCompareResult } | { ok: false; error: string }> =>
    ipcRenderer.invoke('git:compare-branches', args),

  subscribe: (handler: (event: JobStreamEvent) => void): (() => void) => {
    const wrapped = (_e: unknown, payload: JobStreamEvent): void => handler(payload)
    ipcRenderer.on('jobs:stream', wrapped)
    return () => ipcRenderer.removeListener('jobs:stream', wrapped)
  }
}

export type SvnPatchProgress = { current: number; total: number; name: string }

const svnExplorer = {
  listRepos: (): Promise<SvnRepository[]> => ipcRenderer.invoke('svn:list-repos'),

  listPaths: (args: {
    svnUrl: string
  }): Promise<{ ok: true; entries: SvnPathEntry[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('svn:list-paths', args),

  listLog: (args: {
    svnUrl: string
    limit?: number
  }): Promise<{ ok: true; commits: SvnCommit[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('svn:list-log', args),

  checkoutAndIndex: (args: {
    svnUrl: string
    repoName: string
  }): Promise<
    | { ok: true; workDir: string; revision: number | null; headers: HeaderEntry[] }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('svn:checkout-and-index', args),

  generatePatch: (args: {
    workDir: string
    commentTargets: CommentTarget[]
    commentHeader: boolean
    commentBody: boolean
    depth?: number
  }): Promise<{ ok: true; result: SvnPatchResult } | { ok: false; error: string }> =>
    ipcRenderer.invoke('svn:generate-patch', args),

  listBranchPaths: (args: {
    repoUrl: string
  }): Promise<
    { ok: true; paths: { label: string; url: string }[] } | { ok: false; error: string }
  > => ipcRenderer.invoke('svn:list-branch-paths', args),

  comparePaths: (args: {
    baseUrl: string
    compareUrl: string
    baseLabel: string
    compareLabel: string
  }): Promise<{ ok: true; result: BranchCompareResult } | { ok: false; error: string }> =>
    ipcRenderer.invoke('svn:compare-paths', args),

  cleanup: (args: { workDir: string }): Promise<void> => ipcRenderer.invoke('svn:cleanup', args),

  savePatch: (args: {
    patch: string
    defaultName?: string
  }): Promise<{ ok: true; path: string } | { ok: false; cancelled?: true; error?: string }> =>
    ipcRenderer.invoke('svn:save-patch', args),

  detectBinary: (): Promise<{ available: boolean; path: string; version: string | null }> =>
    ipcRenderer.invoke('svn:detect-binary'),

  onPatchProgress: (handler: (p: SvnPatchProgress) => void): (() => void) => {
    const wrapped = (_e: unknown, payload: SvnPatchProgress): void => handler(payload)
    ipcRenderer.on('svn:patch-progress', wrapped)
    return () => ipcRenderer.removeListener('svn:patch-progress', wrapped)
  }
}

const compare = {
  quickSummary: (
    req: DetailedSummaryRequest
  ): Promise<
    { ok: true; summary: string; diagnostics: SummaryDiagnostics } | { ok: false; error: string }
  > => ipcRenderer.invoke('compare:quick-summary', req),
  detailedSummary: (
    req: DetailedSummaryRequest
  ): Promise<
    { ok: true; summary: string; diagnostics: SummaryDiagnostics } | { ok: false; error: string }
  > => ipcRenderer.invoke('compare:detailed-summary', req)
}

export type CppProjectInfo = {
  path: string | null
  exists: boolean
  hasCMake: boolean
  label: string | null
}

const projectRoot = {
  get: (): Promise<CppProjectInfo> => ipcRenderer.invoke('project-root:get'),
  pick: (): Promise<{ ok: boolean; project: CppProjectInfo }> =>
    ipcRenderer.invoke('project-root:pick'),
  clear: (): Promise<CppProjectInfo> => ipcRenderer.invoke('project-root:clear')
}

// ----- Phase 5-10 features -----

export type PendingWriteAction =
  | { kind: 'add_comment'; artifactId: number; comment: string; format?: 'text' | 'html' }
  | { kind: 'transition_status'; artifactId: number; newStatus: string }
  | { kind: 'create_artifact'; trackerId: number; title: string; description: string | null }
  | {
      kind: 'move_to_sprint'
      artifactIds: number[]
      milestoneId: number | null
      fromMilestoneId?: number | null
    }
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
  scanRisks: (args: {
    items: ArtifactSummary[]
  }): Promise<{
    ok: true
    risks: Array<{ id: number; level: 'low' | 'medium' | 'high'; reason: string }>
  }> => ipcRenderer.invoke('sprint:scan-risks', args),
  moveItem: (args: {
    artifactId: number
    trackerId: number
    targetStatus: string
  }): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('sprint:move-item', args)
}

const ticketBranch = {
  preview: (args: { artifactId: number }) =>
    ipcRenderer.invoke('ticket-branch:preview', args) as Promise<
      | {
          ok: true
          branchName: string
          commitMessage: string
          prBody: string
          contextMarkdown: string
        }
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
    ipcRenderer.invoke('ticket-branch:make-tempdir'),
  searchArtifacts: (
    query: string
  ): Promise<Array<{ id: number; title: string; trackerId: number | null }>> =>
    ipcRenderer.invoke('ticket-branch:search-artifacts', { query }),
  cloneRepo: (args: {
    repoName: string
    cloneUrl: string
  }): Promise<{ ok: true; path: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ticket-branch:clone-repo', args)
}

const prReviewer = {
  listRepos: (): Promise<GitRepository[]> => ipcRenderer.invoke('pr-reviewer:list-repos'),
  listPrs: (args: { repoId: number }) =>
    ipcRenderer.invoke('pr-reviewer:list-prs', args) as Promise<
      Array<{
        id: number
        title: string
        branchSrc: string
        branchDest: string
        status: string
        htmlUrl: string
      }>
    >,
  analyze: (args: {
    prId: number
    repoId: number
    cloneUrl: string
    branchSrc: string
    branchDest: string
    sections: {
      overview: boolean
      codingRules: boolean
      tests: boolean
      acceptanceCriteria: boolean
    }
    artifactIdHint?: number | null
  }) => ipcRenderer.invoke('pr-reviewer:analyze', args)
}

const rag = {
  index: () => ipcRenderer.invoke('rag:index'),
  search: (args: { query: string; limit?: number }) => ipcRenderer.invoke('rag:search', args),
  subscribeProgress: (
    handler: (payload: { done: number; total: number }) => void
  ): (() => void) => {
    const wrapped = (_e: unknown, payload: { done: number; total: number }): void =>
      handler(payload)
    ipcRenderer.on('rag:progress', wrapped)
    return () => ipcRenderer.removeListener('rag:progress', wrapped)
  }
}

const releaseNotes = {
  generate: (args: {
    repoPath?: string
    repoId?: number
    cloneUrl?: string
    fromRef: string
    toRef: string
    windowDays?: number
    artifactRefRegex?: string
  }) => ipcRenderer.invoke('release-notes:generate', args),
  listTags: (repoPath: string): Promise<string[]> =>
    ipcRenderer.invoke('release-notes:list-tags', repoPath),
  listRemoteTags: (args: { repoId: number; cloneUrl: string }): Promise<string[]> =>
    ipcRenderer.invoke('release-notes:list-remote-tags', args)
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

type JenkinsInvestigateResult = JenkinsFailureAnalysis | { ok: false; error: string; kind: string }

const jenkins = {
  testConnection: (): Promise<JenkinsConnectionTestResult> =>
    ipcRenderer.invoke('jenkins:test-connection'),
  listJobs: (args?: { folder?: string }): Promise<JenkinsJob[]> =>
    ipcRenderer.invoke('jenkins:list-jobs', args ?? {}),
  discoverJobs: (args?: { folder?: string }): Promise<JenkinsDiscoverResult> =>
    ipcRenderer.invoke('jenkins:discover-jobs', args ?? {}),
  validateJob: (args: { jobPath: string }): Promise<JenkinsValidateResult> =>
    ipcRenderer.invoke('jenkins:validate-job', args),
  getBranchStatus: (args: {
    jobName: string
    branchName: string
  }): Promise<JenkinsBranchStatus | null> => ipcRenderer.invoke('jenkins:get-branch-status', args),
  getBuildHistory: (args: { jobName: string; limit?: number }): Promise<JenkinsBuildSummary[]> =>
    ipcRenderer.invoke('jenkins:get-build-history', args),
  getBuildDetail: (args: { jobName: string; buildNumber: number }): Promise<JenkinsBuildDetail> =>
    ipcRenderer.invoke('jenkins:get-build-detail', args),
  getConsoleText: (args: { jobName: string; buildNumber: number }): Promise<string> =>
    ipcRenderer.invoke('jenkins:get-console-text', args),
  investigateFailure: (args: {
    jobName: string
    buildNumber: number
  }): Promise<JenkinsInvestigateResult> => ipcRenderer.invoke('jenkins:investigate-failure', args),
  getQueue: (): Promise<JenkinsQueueItem[]> => ipcRenderer.invoke('jenkins:get-queue'),
  getNodes: (): Promise<JenkinsNode[]> => ipcRenderer.invoke('jenkins:get-nodes'),
  getBranchTestReport: (args: {
    jobName: string
    branchName: string
  }): Promise<JenkinsBranchTestReport> =>
    ipcRenderer.invoke('jenkins:get-branch-test-report', args),
  getBranchWarnings: (args: {
    jobName: string
    branchName: string
  }): Promise<JenkinsWarningsReport> => ipcRenderer.invoke('jenkins:get-branch-warnings', args),
  getBranchCoverage: (args: {
    jobName: string
    branchName: string
  }): Promise<JenkinsCoverageReport> => ipcRenderer.invoke('jenkins:get-branch-coverage', args)
}

type TtmExportApiResult =
  | ({ ok: true } & JenkinsTtmExportResult)
  | { ok: false; error: string; kind: string }

const jenkinsTtm = {
  export: (args: {
    jobName: string
    buildNumber: number
    branchName: string
    buildUrl: string
  }): Promise<TtmExportApiResult> => ipcRenderer.invoke('jenkins-ttm:export', args),

  subscribeProgress: (handler: (event: JenkinsTtmExportProgress) => void): (() => void) => {
    const wrapped = (_e: unknown, payload: JenkinsTtmExportProgress): void => handler(payload)
    ipcRenderer.on('jenkins-ttm:progress', wrapped)
    return () => ipcRenderer.removeListener('jenkins-ttm:progress', wrapped)
  }
}

const api = {
  settings,
  tuleap,
  generation,
  marp,
  chat,
  auth,
  coder,
  admin,
  debug,
  commenter,
  corrector,
  testgen,
  commenterPr,
  gitExplorer,
  svnExplorer,
  compare,
  projectRoot,
  tuleapWrite,
  sprintBoard,
  ticketBranch,
  prReviewer,
  rag,
  releaseNotes,
  sprintPlanning,
  bugRepro,
  traceability,
  jenkins,
  jenkinsTtm
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
