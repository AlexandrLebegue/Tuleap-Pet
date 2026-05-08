import Store from 'electron-store'
import type { AppConfig } from '@shared/types'

type Schema = AppConfig

export const DEFAULT_LLM_MODEL = 'minimax/minimax-m2:free'

const store = new Store<Schema>({
  name: 'config',
  defaults: { tuleapUrl: null, projectId: null, llmModel: null },
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
    llmModel: store.get('llmModel') ?? null
  }
}

export function getLlmModel(): string {
  return store.get('llmModel') ?? DEFAULT_LLM_MODEL
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

export function setLlmModel(model: string | null): void {
  if (model === null || model.trim() === '') {
    store.set('llmModel', null)
  } else {
    store.set('llmModel', model.trim())
  }
}

export function clearConfig(): void {
  store.clear()
}
