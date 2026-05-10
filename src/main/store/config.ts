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
    tempClonePath: null,
    gitCloneSsh: true
  },
  clearInvalidConfig: true
})

function normalizeUrl(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(trimmed)) return null
  return trimmed
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
    tempClonePath: store.get('tempClonePath') ?? null,
    gitCloneSsh: store.get('gitCloneSsh') ?? true
  }
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

export function clearConfig(): void {
  store.clear()
}
