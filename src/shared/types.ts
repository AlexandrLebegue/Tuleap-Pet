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

export type GenerationOptions = {
  milestoneId: number
  includeLinks?: boolean
  language?: 'fr' | 'en'
}

// ---- Chat (Phase 2) ----

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool'

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
