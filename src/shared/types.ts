/**
 * Types partagés entre main, preload et renderer.
 * Doit rester sans imports d'API Electron / Node spécifiques.
 */

export type TuleapAuthMode = 'token' | 'oauth2'

export type LlmProviderKind = 'openrouter' | 'local'

export type AppConfig = {
  tuleapUrl: string | null
  projectId: number | null
  llmProvider: LlmProviderKind
  llmModel: string | null
  localBaseUrl: string | null
  localModel: string | null
  authMode: TuleapAuthMode
  oauthClientId: string | null
  oauthScope: string | null
  /** Path / command for the OpenCode binary used by the Coder tab. */
  openCodeBinary: string | null
  /** Bypass system proxy for local LLM calls (uses a direct connection). */
  localDirectConnection: boolean
  /** Chatbot: include expert C/C++ coding rules in system prompt. */
  chatbotExpertMode: boolean
  /** Chatbot: include Doxygen documentation rules in system prompt. */
  chatbotDoxygenMode: boolean
  /** Chatbot: enable Tuleap tool calling (get_self, list_artifacts, etc.). */
  chatbotToolsEnabled: boolean
  /** Chatbot: enable Jenkins tool calling (list_jobs, get_build_detail, etc.). */
  chatbotJenkinsToolsEnabled: boolean
  /** Path to temp folder used for auto-cloning repos during background jobs. */
  tempClonePath: string | null
  /** Use SSH for git clone in background jobs (no token injection needed). */
  gitCloneSsh: boolean
  /** Path to the `svn` CLI binary (TortoiseSVN command-line tools). Null = rely on PATH / known install dirs. */
  svnPath: string | null
  /** Root of the C/C++ project the TestGenerator + Commenter analyze (call-graph, CMake update, build). */
  cppProjectRoot: string | null
  /** Jenkins base URL (e.g. https://jenkins.example.com). */
  jenkinsUrl: string | null
  /** Jenkins username for HTTP Basic auth. */
  jenkinsUser: string | null
  /** Folder to start job discovery from (e.g. "DIURNE-LOG"). Empty/null = root. */
  jenkinsDiscoveryFolder: string | null
  /** Map repoId (string) → list of Jenkins job paths for branch status lookup. */
  jenkinsRepoMapping: Record<string, string[]> | null
  /** Tuleap TTM test-definition tracker ID (auto-detected if null). */
  ttmTrackerId: number | null
}

export type ConnectionTestResult =
  | {
      ok: true
      username: string
      realName: string
      userId: number
    }
  | {
      ok: false
      error: string
      kind: 'auth' | 'network' | 'http' | 'schema' | 'unknown'
      status?: number
    }

export type ProjectSummary = {
  id: number
  label: string
  shortname: string
  uri: string
}

export type GitRepository = {
  id: number
  name: string
  description: string
  cloneUrl: string
}

export type GitBranch = {
  name: string
}

// ---- SVN Explorer ----

export type SvnRepository = {
  id: number
  name: string
  description: string
  /** Base checkout URL of the repository (root of the SVN tree). */
  svnUrl: string
}

/** A child entry (trunk / branches / tags, or any directory/file) under an SVN path. */
export type SvnPathEntry = {
  name: string
  kind: 'dir' | 'file'
  revision: number | null
}

export type SvnCommit = {
  /** Revision number as a string (shape-compatible with GitCommit.id). */
  id: string
  /** "r123" short display form. */
  shortId: string
  title: string
  authorName: string
  authoredDate: string
}

/** Result of the "generate a patch" SVN job: a unified diff, never committed. */
export type SvnPatchResult = {
  /** Unified diff (`svn diff`) of the AI-applied changes; '' if nothing changed. */
  patch: string
  /** Relative paths of files the patch touches. */
  changedFiles: string[]
  /** Number of functions/targets for which a comment was produced. */
  commented: number
  failed: number
  warnings: string[]
}

// ---- Branch / path comparison (Git Explorer + SVN Explorer) ----

export type BranchCompareCommit = {
  /** Commit hash (git) or revision "r123" (svn). */
  id: string
  title: string
  authorName: string
}

/** One LLM call attempt, recorded for the "Débug IA" panel. */
export type SummaryAttempt = {
  /** Which phase produced it: 'quick' | 'map' | 'reduce'. */
  phase: string
  /** ok = usable answer; empty/too-short = unusable; error/no-provider = call failed. */
  outcome: 'ok' | 'empty' | 'too-short' | 'error' | 'no-provider'
  finishReason?: string | null
  /** Raw response length (chars) before sanitisation. */
  rawChars?: number
  /** Length after stripping <think>/fences. */
  cleanChars?: number
  /** Human-readable explanation (error message, "think-only", …). */
  detail?: string
}

/** Why the AI summary succeeded or fell back — surfaced to the user for debugging. */
export type SummaryDiagnostics = {
  provider: string | null
  model: string | null
  /** True when no usable LLM answer was produced and the metadata fallback was used. */
  usedFallback: boolean
  attempts: SummaryAttempt[]
}

/** Counts of changed files per category + the most-touched directories. */
export type DiffFileBreakdown = {
  source: number
  test: number
  config: number
  generated: number
  other: number
  topDirs: { dir: string; files: number }[]
}

/** A single changed file, for the per-file/per-folder diff explorer. */
export type DiffFileChange = {
  /** Path relative to the repo root (forward slashes). */
  path: string
  category: 'source' | 'test' | 'config' | 'generated' | 'other'
  additions: number
  deletions: number
  /** This file's unified diff hunks (capped); '' when not captured (budget hit). */
  diff: string
  /** True when this file's diff was capped or not captured. */
  diffTruncated: boolean
}

/** Difference between a base branch/path and a compare branch/path + AI summary. */
export type BranchCompareResult = {
  /** Base ref/path label (what we compare against). */
  base: string
  /** Compare ref/path label (the branch whose new features we surface). */
  compare: string
  /** Unified diff, possibly truncated for display. */
  diff: string
  /** True when `diff` was truncated (the full diff was larger). */
  diffTruncated: boolean
  /** Commits present in `compare` but not in `base` (git) or the branch's own history (svn). */
  commits: BranchCompareCommit[]
  /** Relative paths of files that differ. */
  filesChanged: string[]
  stats: { files: number; additions: number; deletions: number }
  /** File-category breakdown + most-touched directories. */
  breakdown: DiffFileBreakdown
  /** Denoised source/test diff sample, fed to the on-demand detailed summary. */
  sourceSample: string
  sourceSampleTruncated: boolean
  /** Per-file changes for the diff explorer (file tree + per-file diff). */
  files: DiffFileChange[]
  /** True when more files changed than were captured into `files`. */
  filesTruncated: boolean
}

/** Payload to compute the detailed (map-reduce) summary on demand. */
export type DetailedSummaryRequest = {
  vcs: 'git' | 'svn'
  base: string
  compare: string
  stats: { files: number; additions: number; deletions: number }
  breakdown: DiffFileBreakdown
  commits: BranchCompareCommit[]
  sourceSample: string
  sourceSampleTruncated: boolean
}

export type CommenterPRProgress =
  | { type: 'start'; totalFiles: number; estimatedSeconds: number }
  | { type: 'file'; index: number; total: number; filename: string; etaSeconds: number }
  | { type: 'git'; step: 'checkout' | 'branch' | 'add' | 'commit' | 'push' }
  | { type: 'pr'; prId: number }
  | { type: 'done'; filesProcessed: number; skippedFiles: number; branchName: string }
  | { type: 'error'; message: string }

export type TrackerSummary = {
  id: number
  label: string
  itemName: string
  description: string
  color: string | null
  artifactCount: number | null
}

export type ArtifactFieldValue = {
  fieldId: number
  label: string
  type: string
  value: unknown
}

export type ArtifactLink = {
  id: number
  uri: string
  type: string | null
  direction: 'forward' | 'reverse'
}

export type ArtifactSummary = {
  id: number
  title: string
  status: string | null
  uri: string
  htmlUrl: string | null
  submittedBy: string | null
  submittedOn: string | null
  lastModified: string | null
  trackerId: number
}

export type ArtifactDetail = ArtifactSummary & {
  description: string | null
  values: ArtifactFieldValue[]
  links: ArtifactLink[]
}

export type Page<T> = {
  items: T[]
  total: number
  limit: number
  offset: number
}

export type MilestoneStatus = 'open' | 'closed' | 'all'

export type MilestoneSummary = {
  id: number
  label: string
  status: 'open' | 'closed' | null
  semanticStatus: 'open' | 'closed' | null
  startDate: string | null
  endDate: string | null
  uri: string
  htmlUrl: string | null
}

export type SprintContent = {
  milestone: MilestoneSummary
  artifacts: ArtifactSummary[]
}

export type SprintReviewSlideType =
  | 'titre'
  | 'contexte'
  | 'equipe'
  | 'livrables'
  | 'avancement'
  | 'indicateurs'
  | 'risques'
  | 'synthese'

export type SprintReviewProgressEvent =
  | { type: 'enriching'; index: number; total: number }
  | { type: 'summarizing' }
  | { type: 'slide_start'; slide: SprintReviewSlideType; index: number; total: number }
  | { type: 'slide_done'; slide: SprintReviewSlideType; index: number; total: number }
  | {
      type: 'slide_error'
      slide: SprintReviewSlideType
      index: number
      total: number
      error: string
    }
  | { type: 'assembling' }
  | { type: 'done' }

export type GenerationSource =
  | { mode: 'sprint'; milestoneId: number }
  | { mode: 'custom'; artifactIds: number[]; label: string; trackerLabel?: string }

export type GenerationOptions = {
  source: GenerationSource
  language?: 'fr' | 'en'
}

// ---- Chat (Phase 2) ----

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool'

/** A document attached to a chat message, with its extracted text. */
export type ChatAttachment = {
  /** File name (basename only). */
  name: string
  /** Extracted plain text (possibly truncated). */
  text: string
  /** Original file size in bytes. */
  sizeBytes: number
  /** True when the extracted text was cut at the per-file character cap. */
  truncated: boolean
  kind: 'pdf' | 'docx' | 'text'
}

export type ChatToolEvent =
  | { kind: 'call'; name: string; toolCallId: string; args: unknown }
  | { kind: 'result'; name: string; toolCallId: string; result: unknown; error?: string }

export type ChatMessage = {
  id: number
  conversationId: number
  role: ChatRole
  content: string
  toolEvents?: ChatToolEvent[]
  createdAt: number
}

export type ChatConversation = {
  id: number
  title: string
  createdAt: number
  updatedAt: number
  model: string | null
  projectId: number | null
}

// ---- Coder (Phase 3) ----

export type CoderStreamEvent =
  | { type: 'started'; sessionId: string; pid: number; command: string; cwd: string }
  | { type: 'stdout'; sessionId: string; chunk: string }
  | { type: 'stderr'; sessionId: string; chunk: string }
  | { type: 'exit'; sessionId: string; code: number | null; signal: string | null }
  | { type: 'error'; sessionId: string; error: string }

export type CoderRunRequest = {
  artifactId?: number | null
  prompt: string
  cwd?: string | null
  binaryPath?: string | null
  /** Extra arguments passed verbatim before the prompt. */
  extraArgs?: string[]
}

export type CoderContextResult = {
  artifact: ArtifactDetail
  contextMarkdown: string
}

// ---- Admin (Phase 4) ----

export type AdminTrackerActivity = {
  trackerId: number
  trackerLabel: string
  itemName: string
  total: number
  recent: number
  recentArtifacts: ArtifactSummary[]
}

export type AdminScanResult = {
  scannedAt: number
  windowDays: number
  projectId: number
  projectLabel: string
  totalArtifactsRecent: number
  trackers: AdminTrackerActivity[]
  openSprints: MilestoneSummary[]
}

// ---- Kanban / Tracker structure ----

export type TrackerFieldBindValue = { id: number; label: string }

export type TrackerField = {
  fieldId: number
  label: string
  type: string
  bindValues: TrackerFieldBindValue[]
}

export type TrackerFields = {
  trackerId: number
  titleFieldId: number | null
  statusFieldId: number | null
  descriptionFieldId: number | null
  statusField: TrackerField | null
}

export type ChatStreamEvent =
  | { type: 'started'; conversationId: number; assistantMessageId: number }
  | { type: 'delta'; conversationId: number; assistantMessageId: number; delta: string }
  | {
      type: 'tool-call'
      conversationId: number
      assistantMessageId: number
      toolCallId: string
      name: string
      args: unknown
    }
  | {
      type: 'tool-result'
      conversationId: number
      assistantMessageId: number
      toolCallId: string
      name: string
      result: unknown
      error?: string
    }
  | {
      type: 'done'
      conversationId: number
      assistantMessageId: number
      finishReason: string | null
      usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null
      model: string
    }
  | { type: 'error'; conversationId: number; assistantMessageId: number; error: string }

// ---- Git Explorer ----

export type GitCommit = {
  id: string
  shortId: string
  title: string
  authorName: string
  authoredDate: string
}

export type CommentingOptions = {
  preserveExisting: boolean
  addFileHeader: boolean
  detailedComments: boolean
  applyCodingRules: boolean
  onlyChangedFiles: boolean
  useContextPipeline?: boolean
  forceAll?: boolean
  contextDepth?: number
  contextTokenBudget?: number
  inlineComments?: boolean
  /** Git-tree commenter: write the Doxygen brief above the declaration in the .h file. */
  commentHeader?: boolean
  /** Git-tree commenter: add inline comments inside the function body (in the .c file). */
  commentBody?: boolean
  /** Test-generator pipeline mode ('basic' = fast single call, 'advanced' = call-graph context). */
  testPipelineMode?: 'basic' | 'advanced'
  testBuildEnabled?: boolean
  testPreset?: string
  testMaxRepairs?: number
}

export type SourceInputMode = 'folder' | 'files' | 'git'

export interface GitSourceInput {
  repoUrl: string
  branch: string
  onlyRecentFiles: boolean
}

export type JobType = 'commentateur' | 'test-generator' | 'warning-corrector'

/** Warning-corrector job options (Git-tree « Corriger les warnings »). */
export type WarningCorrectorJobOptions = {
  /** Recompile→correct retries allowed after the first pass (default 2). */
  maxRetries: number
}

/** A function reachable from a header: defined inline in the header or in its paired source file. */
export type HeaderFunctionEntry = {
  name: string
  signature: string
  /** Source file where the function is implemented, relative to the clone dir. */
  implFile: string
  /** 1-based line where the implementation starts. */
  implLine: number
  /** True when the function is defined inline inside the header itself. */
  inHeader: boolean
}

export type HeaderEntry = {
  /** Header path relative to the clone dir. */
  headerPath: string
  functions: HeaderFunctionEntry[]
}

export type HeaderIndexResult =
  | { ok: true; cloneDir: string; headers: HeaderEntry[] }
  | { ok: false; error: string }

/** A test-generation target: a source file and the subset of its functions to test. */
export type TestGenSelection = {
  /** Source file relative to the clone dir. */
  sourceFile: string
  functions: string[]
}

/**
 * A commenter target (Git-tree commenter): one function to document. The brief
 * goes above its declaration in the header; inline comments go in its body in
 * the implementation file. All paths are relative to the clone dir.
 */
export type CommentTarget = {
  /** Header (.h) declaring the function — where the brief block is inserted. */
  headerPath: string
  name: string
  /** File implementing the function (.c, or the header itself if inline). */
  implFile: string
  implLine: number
  /** True when the function is defined inline in the header. */
  inHeader: boolean
}

export type JobStatus =
  | 'queued'
  | 'cloning'
  | 'processing'
  | 'committing'
  | 'pushing'
  | 'creating-pr'
  | 'done'
  | 'error'
  | 'cancelled'

export type BackgroundJob = {
  id: string
  type: JobType
  repoName: string
  branchName: string
  status: JobStatus
  currentFile: string | null
  progress: { current: number; total: number } | null
  error: string | null
  prId: number | null
  prUrl: string | null
  branchCreated: string | null
  createdAt: number
}

export type JobStreamEvent =
  | { type: 'queued'; job: BackgroundJob }
  | { type: 'status'; jobId: string; status: JobStatus }
  | { type: 'progress'; jobId: string; current: number; total: number; currentFile: string }
  | {
      type: 'done'
      jobId: string
      prId: number | null
      prUrl: string | null
      branchCreated: string
    }
  | { type: 'error'; jobId: string; error: string }
  | { type: 'cancelled'; jobId: string }

// ---- Jenkins ----

export type JenkinsBuildResult = 'SUCCESS' | 'FAILURE' | 'UNSTABLE' | 'ABORTED' | 'NOT_BUILT' | null

export type JenkinsJob = {
  name: string
  displayName: string
  url: string
  /** Jenkins color field: 'blue' | 'red' | 'yellow' | 'grey' | '*_anime' | 'disabled' | 'notbuilt' */
  color: string
  lastBuildNumber: number | null
  lastBuildTimestamp: string | null
  lastBuildResult: JenkinsBuildResult
  isFolder: boolean
  jobClass: string
}

/** A selectable job found by the recursive discovery crawler (folders excluded). */
export type JenkinsDiscoveredJob = {
  /** Full slash-separated path, e.g. "Diurne-Log/Build-JenkinsFile/DIURNE". */
  fullPath: string
  name: string
  displayName: string
  url: string
  kind: 'multibranch' | 'job'
  color: string
}

export type JenkinsDiscoverResult =
  | { ok: true; jobs: JenkinsDiscoveredJob[] }
  | { ok: false; error: string; kind: string; status?: number }

export type JenkinsValidateResult =
  | { ok: true; exists: boolean; kind: string | null; url: string | null }
  | { ok: false; error: string; kind: string; status?: number }

export type JenkinsBuildSummary = {
  number: number
  url: string
  result: JenkinsBuildResult
  duration: number | null
  timestamp: string
  displayName: string
  building: boolean
}

export type JenkinsBuildDetail = JenkinsBuildSummary & {
  jobName: string
  description: string | null
  fullDisplayName: string
  consoleUrl: string
  parameters: Array<{ name: string; value: string | number | boolean | null; type: string }>
  testReport: {
    totalCount: number
    failCount: number
    skipCount: number
    passCount: number
  } | null
}

export type JenkinsBranchStatus = {
  branchName: string
  buildNumber: number | null
  result: JenkinsBuildResult
  building: boolean
  timestamp: string | null
  url: string | null
}

export type JenkinsQueueItem = {
  id: number
  why: string | null
  inQueueSince: string
  jobName: string
  jobUrl: string
  blocked: boolean
  buildable: boolean
  stuck: boolean
}

export type JenkinsNode = {
  displayName: string
  description: string | null
  offline: boolean
  temporarilyOffline: boolean
  offlineCauseReason: string | null
  status: 'online' | 'offline' | 'temporarily-offline' | 'unknown'
  numExecutors: number
  idle: boolean
  monitorData: {
    responseTime: number | null
    diskSpaceGb: number | null
    availableRamMb: number | null
  }
}

export type JenkinsConnectionTestResult =
  | {
      ok: true
      version: string
      nodeName: string
      /** Jenkins whoAmI name (resolved username). */
      whoAmIName: string
      /** Granted authorities, e.g. ["authenticated"]. If groups are missing it signals SSO group resolution is broken for API tokens. */
      authorities: string[]
      /** True when the only authority is "authenticated" — no AD/LDAP groups resolved, API access to protected folders will fail with 404. */
      missingGroups: boolean
      /** Format of the configured secret: Jenkins API token (11+32 hex), Tuleap access key (tlp.k1.…) or unknown. */
      tokenKind: 'jenkins-api-token' | 'tuleap-access-key' | 'unknown'
    }
  | {
      ok: false
      error: string
      kind: 'auth' | 'network' | 'http' | 'schema' | 'unknown'
      status?: number
      /** Token kind is included even on failure so the UI can give targeted advice. */
      tokenKind?: 'jenkins-api-token' | 'tuleap-access-key' | 'unknown'
    }

// ---- Jenkins → Tuleap TTM ----

export type JenkinsTestCase = {
  fullName: string
  className: string
  testName: string
  status: 'passed' | 'failed' | 'blocked'
  duration: number
  errorDetails: string | null
  errorStackTrace: string | null
}

export type JenkinsTestReport = {
  totalCount: number
  failCount: number
  skipCount: number
  passCount: number
  cases: JenkinsTestCase[]
}

export type JenkinsTtmExportResult = {
  campaignId: number
  campaignUrl: string
  total: number
  passed: number
  failed: number
  blocked: number
  newDefinitions: number
}

export type JenkinsTtmExportProgress =
  | { type: 'start'; total: number; campaignId: number; campaignLabel: string }
  | { type: 'progress'; done: number; total: number; currentTest: string }
  | { type: 'done'; result: JenkinsTtmExportResult }
  | { type: 'error'; message: string }

export type JenkinsFailureAnalysis = {
  rootCause: string
  affectedSteps: string[]
  suggestion: string
  severity: 'error' | 'warning' | 'info'
}

export type JenkinsBranchTestReport = {
  branchName: string
  buildNumber: number
  report: JenkinsTestReport
} | null

export type JenkinsWarningsReport = {
  totalCount: number
  tools: Array<{ name: string; count: number }>
} | null

export type JenkinsCoverageReport = {
  lineCoverage: number | null
  branchCoverage: number | null
} | null
