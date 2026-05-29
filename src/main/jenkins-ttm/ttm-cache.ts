import Store from 'electron-store'

type CacheSchema = {
  definitions: Record<string, number>
  warmed: Record<string, boolean>
}

const store = new Store<CacheSchema>({
  name: 'ttm-cache',
  defaults: { definitions: {}, warmed: {} }
})

function defKey(projectId: number, fullName: string): string {
  return `${projectId}:${fullName}`
}

function warmKey(projectId: number, trackerId: number): string {
  return `${projectId}:${trackerId}`
}

export function getCachedDefinitionId(projectId: number, fullName: string): number | null {
  const defs = store.get('definitions') as Record<string, number>
  return defs[defKey(projectId, fullName)] ?? null
}

export function setCachedDefinitionId(projectId: number, fullName: string, id: number): void {
  const defs = store.get('definitions') as Record<string, number>
  defs[defKey(projectId, fullName)] = id
  store.set('definitions', defs)
}

export function bulkSetDefinitions(
  projectId: number,
  entries: Array<{ fullName: string; id: number }>
): void {
  const defs = store.get('definitions') as Record<string, number>
  for (const e of entries) {
    defs[defKey(projectId, e.fullName)] = e.id
  }
  store.set('definitions', defs)
}

export function isCacheWarmed(projectId: number, trackerId: number): boolean {
  const warmed = store.get('warmed') as Record<string, boolean>
  return warmed[warmKey(projectId, trackerId)] === true
}

export function markCacheWarmed(projectId: number, trackerId: number): void {
  const warmed = store.get('warmed') as Record<string, boolean>
  warmed[warmKey(projectId, trackerId)] = true
  store.set('warmed', warmed)
}

export function clearTtmCache(projectId?: number): void {
  if (projectId === undefined) {
    store.set('definitions', {})
    store.set('warmed', {})
    return
  }
  const prefix = `${projectId}:`
  const defs = store.get('definitions') as Record<string, number>
  const warmed = store.get('warmed') as Record<string, boolean>
  for (const key of Object.keys(defs)) {
    if (key.startsWith(prefix)) delete defs[key]
  }
  for (const key of Object.keys(warmed)) {
    if (key.startsWith(prefix)) delete warmed[key]
  }
  store.set('definitions', defs)
  store.set('warmed', warmed)
}
