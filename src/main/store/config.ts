import Store from 'electron-store'
import type { AppConfig, LlmProviderKind, TuleapAuthMode } from '@shared/types'

type Schema = AppConfig

export const DEFAULT_LLM_MODEL = 'minimax/minimax-m2:free'
export const DEFAULT_OAUTH_SCOPE = 'read:user_membership read:project read:tracker'

const store = new Store<Schema>({
  name: 'config',
  defaults: {
    tuleapUrl: null,
    projectId: null,
    llmProvider: 'openrouter',
    llmModel: null,
    localBaseUrl: null,
    localModel: null,
    localDirectConnection: true,
    authMode: 'token',
    oauthClientId: null,
    oauthScope: null,
    openCodeBinary: null,
    chatbotExpertMode: false,
    chatbotDoxygenMode: false,
    chatbotToolsEnabled: true,
    chatbotJenkinsToolsEnabled: true,
    tempClonePath: null,
    gitCloneSsh: true,
    cppProjectRoot: null,
    jenkinsUrl: null,
    jenkinsUser: null,
    jenkinsDiscoveryFolder: null,
    jenkinsRepoMapping: null,
    ttmTrackerId: null
  },
  clearInvalidConfig: true
})

function normalizeUrl(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(trimmed)) return null
  return trimmed
}

/**
 * Read the repo→jobs mapping, tolerating the legacy `Record<string,string>`
 * format (a single job path per repo) by wrapping each value into an array.
 */
function normalizeRepoMapping(raw: unknown): Record<string, string[]> | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      const jobs = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      if (jobs.length > 0) out[key] = jobs
    } else if (typeof value === 'string' && value.trim().length > 0) {
      out[key] = [value.trim()]
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

export function getConfig(): AppConfig {
  return {
    tuleapUrl: store.get('tuleapUrl') ?? null,
    projectId: store.get('projectId') ?? null,
    llmProvider: (store.get('llmProvider') ?? 'openrouter') as LlmProviderKind,
    llmModel: store.get('llmModel') ?? null,
    localBaseUrl: store.get('localBaseUrl') ?? null,
    localModel: store.get('localModel') ?? null,
    localDirectConnection: store.get('localDirectConnection') ?? true,
    authMode: (store.get('authMode') ?? 'token') as TuleapAuthMode,
    oauthClientId: store.get('oauthClientId') ?? null,
    oauthScope: store.get('oauthScope') ?? null,
    openCodeBinary: store.get('openCodeBinary') ?? null,
    chatbotExpertMode: store.get('chatbotExpertMode') ?? false,
    chatbotDoxygenMode: store.get('chatbotDoxygenMode') ?? false,
    chatbotToolsEnabled: store.get('chatbotToolsEnabled') ?? true,
    chatbotJenkinsToolsEnabled: store.get('chatbotJenkinsToolsEnabled') ?? true,
    tempClonePath: store.get('tempClonePath') ?? null,
    gitCloneSsh: store.get('gitCloneSsh') ?? true,
    cppProjectRoot: store.get('cppProjectRoot') ?? null,
    jenkinsUrl: store.get('jenkinsUrl') ?? null,
    jenkinsUser: store.get('jenkinsUser') ?? null,
    jenkinsDiscoveryFolder: store.get('jenkinsDiscoveryFolder') ?? null,
    jenkinsRepoMapping: normalizeRepoMapping(store.get('jenkinsRepoMapping')),
    ttmTrackerId: (store.get('ttmTrackerId') as number | null) ?? null
  }
}

export function getCppProjectRoot(): string | null {
  return store.get('cppProjectRoot') ?? null
}

export function setCppProjectRoot(p: string | null): void {
  store.set('cppProjectRoot', p && p.trim().length > 0 ? p.trim() : null)
}

export function getTempClonePath(): string | null {
  return store.get('tempClonePath') ?? null
}

export function setTempClonePath(p: string | null): void {
  store.set('tempClonePath', p && p.trim().length > 0 ? p.trim() : null)
}

export function getGitCloneSsh(): boolean {
  return store.get('gitCloneSsh') ?? true
}

export function setGitCloneSsh(value: boolean): void {
  store.set('gitCloneSsh', value)
}

export function getLocalDirectConnection(): boolean {
  return store.get('localDirectConnection') ?? true
}

export function setLocalDirectConnection(value: boolean): void {
  store.set('localDirectConnection', value)
}

export function getLlmProvider(): LlmProviderKind {
  return (store.get('llmProvider') ?? 'openrouter') as LlmProviderKind
}

export function getLlmModel(): string {
  return store.get('llmModel') ?? DEFAULT_LLM_MODEL
}

export function getLocalBaseUrl(): string | null {
  return store.get('localBaseUrl') ?? null
}

export function getLocalModel(): string | null {
  return store.get('localModel') ?? null
}

export function getOAuthScope(): string {
  return store.get('oauthScope') ?? DEFAULT_OAUTH_SCOPE
}

export function setTuleapUrl(url: string | null): string | null {
  const normalized = normalizeUrl(url)
  if (normalized === null) {
    store.set('tuleapUrl', null)
  } else {
    store.set('tuleapUrl', normalized)
  }
  return normalized
}

export function setProjectId(id: number | null): void {
  if (id === null) {
    store.set('projectId', null)
  } else {
    store.set('projectId', id)
  }
}

export function setLlmProvider(provider: LlmProviderKind): void {
  store.set('llmProvider', provider)
}

export function setLlmModel(model: string | null): void {
  if (model === null || model.trim() === '') {
    store.set('llmModel', null)
  } else {
    store.set('llmModel', model.trim())
  }
}

export function setLocalBaseUrl(url: string | null): void {
  const normalized = normalizeUrl(url)
  store.set('localBaseUrl', normalized)
}

export function setLocalModel(model: string | null): void {
  store.set('localModel', model === null || model.trim() === '' ? null : model.trim())
}

export function setAuthMode(mode: TuleapAuthMode): void {
  store.set('authMode', mode)
}

export function setOAuthClientId(id: string | null): void {
  store.set('oauthClientId', id && id.trim().length > 0 ? id.trim() : null)
}

export function setOAuthScope(scope: string | null): void {
  store.set('oauthScope', scope && scope.trim().length > 0 ? scope.trim() : null)
}

export function setOpenCodeBinary(path: string | null): void {
  store.set('openCodeBinary', path && path.trim().length > 0 ? path.trim() : null)
}

export function getChatbotExpertMode(): boolean {
  return store.get('chatbotExpertMode') ?? false
}

export function getChatbotDoxygenMode(): boolean {
  return store.get('chatbotDoxygenMode') ?? false
}

export function setChatbotExpertMode(value: boolean): void {
  store.set('chatbotExpertMode', value)
}

export function setChatbotDoxygenMode(value: boolean): void {
  store.set('chatbotDoxygenMode', value)
}

export function getChatbotToolsEnabled(): boolean {
  return store.get('chatbotToolsEnabled') ?? true
}

export function setChatbotToolsEnabled(value: boolean): void {
  store.set('chatbotToolsEnabled', value)
}

export function getChatbotJenkinsToolsEnabled(): boolean {
  return store.get('chatbotJenkinsToolsEnabled') ?? true
}

export function setChatbotJenkinsToolsEnabled(value: boolean): void {
  store.set('chatbotJenkinsToolsEnabled', value)
}

export function getJenkinsUrl(): string | null {
  return store.get('jenkinsUrl') ?? null
}

export function setJenkinsUrl(url: string | null): string | null {
  const normalized = normalizeUrl(url)
  store.set('jenkinsUrl', normalized)
  return normalized
}

export function getJenkinsUser(): string | null {
  return store.get('jenkinsUser') ?? null
}

export function setJenkinsUser(user: string | null): void {
  store.set('jenkinsUser', user && user.trim().length > 0 ? user.trim() : null)
}

export function getJenkinsDiscoveryFolder(): string | null {
  return store.get('jenkinsDiscoveryFolder') ?? null
}

export function setJenkinsDiscoveryFolder(folder: string | null): void {
  const trimmed = folder?.trim().replace(/^\/+|\/+$/g, '') || null
  store.set('jenkinsDiscoveryFolder', trimmed)
}

export function getJenkinsRepoMapping(): Record<string, string[]> | null {
  return normalizeRepoMapping(store.get('jenkinsRepoMapping'))
}

export function setJenkinsRepoMapping(mapping: Record<string, string[]> | null): void {
  store.set('jenkinsRepoMapping', mapping)
}

export function getTtmTrackerId(): number | null {
  return (store.get('ttmTrackerId') as number | null) ?? null
}

export function setTtmTrackerId(id: number | null): void {
  store.set('ttmTrackerId', id)
}

export function clearConfig(): void {
  store.clear()
}
