import { ipcMain } from 'electron'
import {
  TuleapAuthError,
  TuleapError,
  TuleapNetworkError,
  TuleapNotFoundError,
  TuleapSchemaError,
  TuleapServerError,
  buildTuleapClient,
  mapArtifactDetail,
  mapArtifactSummary,
  mapProject,
  mapTracker,
  mapTrackerFields,
  type PaginatedResponse
} from '../tuleap'
import { getConfig } from '../store/config'
import { audit } from '../store/db'
import type {
  ArtifactDetail,
  ArtifactSummary,
  ConnectionTestResult,
  Page,
  ProjectSummary,
  TrackerFields,
  TrackerSummary
} from '@shared/types'

// buildTuleapClient is now the centralised builder shared with chat tools
// and the generation handlers. It honours both auth modes (token / OAuth2).

function toConnectionResult(err: unknown): ConnectionTestResult {
  if (err instanceof TuleapAuthError) {
    return { ok: false, kind: 'auth', error: err.message, status: err.status ?? 401 }
  }
  if (err instanceof TuleapNotFoundError) {
    return { ok: false, kind: 'http', error: err.message, status: 404 }
  }
  if (err instanceof TuleapServerError) {
    return { ok: false, kind: 'http', error: err.message, status: err.status ?? 500 }
  }
  if (err instanceof TuleapNetworkError) {
    return { ok: false, kind: 'network', error: err.message }
  }
  if (err instanceof TuleapSchemaError) {
    return { ok: false, kind: 'schema', error: err.message }
  }
  if (err instanceof TuleapError) {
    return { ok: false, kind: err.kind, error: err.message }
  }
  return { ok: false, kind: 'unknown', error: err instanceof Error ? err.message : String(err) }
}

function toPage<T, U>(page: PaginatedResponse<T>, mapFn: (item: T) => U): Page<U> {
  return {
    items: page.items.map(mapFn),
    total: page.total,
    limit: page.limit,
    offset: page.offset
  }
}

export function registerTuleapHandlers(): void {
  ipcMain.handle('tuleap:test-connection', async (): Promise<ConnectionTestResult> => {
    audit('tuleap.test-connection')
    try {
      const client = await buildTuleapClient()
      const me = await client.getSelf()
      return {
        ok: true,
        username: me.username,
        realName: me.real_name ?? '',
        userId: me.id
      }
    } catch (err) {
      return toConnectionResult(err)
    }
  })

  ipcMain.handle(
    'tuleap:list-projects',
    async (_event, query?: unknown): Promise<ProjectSummary[]> => {
      const q = typeof query === 'string' ? query : undefined
      const client = await buildTuleapClient()
      audit('tuleap.list-projects', q ?? null)
      const items = await client.fetchAll((offset) =>
        client.listProjects({ limit: 50, offset, query: q })
      )
      return items.map(mapProject)
    }
  )

  ipcMain.handle(
    'tuleap:list-trackers',
    async (_event, projectId?: unknown): Promise<TrackerSummary[]> => {
      const id =
        typeof projectId === 'number' ? projectId : (getConfig().projectId ?? undefined)
      if (typeof id !== 'number') {
        throw new TuleapError('unknown', "Aucun projet n'est sélectionné.")
      }
      const client = await buildTuleapClient()
      audit('tuleap.list-trackers', String(id))
      const rawTrackers = await client.fetchAll((offset) =>
        client.listTrackers(id, { limit: 50, offset })
      )
      const trackers = await Promise.all(
        rawTrackers.map(async (raw) => {
          let count: number | null = null
          try {
            count = await client.countArtifacts(raw.id)
          } catch {
            count = null
          }
          return mapTracker(raw, count)
        })
      )
      return trackers
    }
  )

  ipcMain.handle(
    'tuleap:list-artifacts',
    async (
      _event,
      args: unknown
    ): Promise<Page<ArtifactSummary>> => {
      if (!args || typeof args !== 'object') {
        throw new TuleapError('unknown', 'Arguments invalides.')
      }
      const { trackerId, limit, offset } = args as {
        trackerId?: number
        limit?: number
        offset?: number
      }
      if (typeof trackerId !== 'number' || !Number.isInteger(trackerId) || trackerId <= 0) {
        throw new TuleapError('unknown', "trackerId invalide.")
      }
      const client = await buildTuleapClient()
      audit('tuleap.list-artifacts', String(trackerId), { limit, offset })
      const page = await client.listArtifacts(trackerId, {
        limit: limit ?? 50,
        offset: offset ?? 0
      })
      return toPage(page, mapArtifactSummary)
    }
  )

  ipcMain.handle('tuleap:get-artifact', async (_event, id: unknown): Promise<ArtifactDetail> => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      throw new TuleapError('unknown', "id invalide.")
    }
    const client = await buildTuleapClient()
    audit('tuleap.get-artifact', String(id))
    const raw = await client.getArtifact(id)
    return mapArtifactDetail(raw)
  })

  ipcMain.handle(
    'tuleap:get-tracker-fields',
    async (_event, args: unknown): Promise<TrackerFields> => {
      const { trackerId } = args as { trackerId: number }
      if (typeof trackerId !== 'number' || !Number.isInteger(trackerId) || trackerId <= 0) {
        throw new TuleapError('unknown', 'trackerId invalide.')
      }
      const client = await buildTuleapClient()
      audit('tuleap.get-tracker-fields', String(trackerId))
      const raw = await client.getTrackerFields(trackerId)
      return mapTrackerFields(raw)
    }
  )

  ipcMain.handle(
    'tuleap:create-artifact',
    async (
      _event,
      args: unknown
    ): Promise<ArtifactSummary> => {
      const {
        trackerId,
        titleFieldId,
        title,
        statusFieldId,
        statusBindValueId,
        descriptionFieldId,
        description
      } = args as {
        trackerId: number
        titleFieldId: number
        title: string
        statusFieldId?: number | null
        statusBindValueId?: number | null
        descriptionFieldId?: number | null
        description?: string | null
      }
      const client = await buildTuleapClient()
      audit('tuleap.create-artifact', String(trackerId))
      const created = await client.createArtifact({
        trackerId,
        titleFieldId,
        title,
        statusFieldId: statusFieldId ?? null,
        statusBindValueId: statusBindValueId ?? null,
        descriptionFieldId: descriptionFieldId ?? null,
        description: description ?? null
      })
      const raw = await client.getArtifact(created.id)
      return mapArtifactDetail(raw)
    }
  )

  ipcMain.handle(
    'tuleap:update-artifact-status',
    async (_event, args: unknown): Promise<{ ok: true }> => {
      const { artifactId, statusFieldId, statusBindValueId } = args as {
        artifactId: number
        statusFieldId: number
        statusBindValueId: number
      }
      const client = await buildTuleapClient()
      audit('tuleap.update-artifact-status', String(artifactId))
      await client.updateArtifactStatus({ artifactId, statusFieldId, statusBindValueId })
      return { ok: true }
    }
  )

  ipcMain.handle(
    'tuleap:update-artifact',
    async (_event, args: unknown): Promise<{ ok: true }> => {
      const {
        artifactId,
        titleFieldId,
        title,
        descriptionFieldId,
        description,
        statusFieldId,
        statusBindValueId
      } = args as {
        artifactId: number
        titleFieldId?: number | null
        title?: string | null
        descriptionFieldId?: number | null
        description?: string | null
        statusFieldId?: number | null
        statusBindValueId?: number | null
      }
      const client = await buildTuleapClient()
      audit('tuleap.update-artifact', String(artifactId))
      await client.updateArtifact({
        artifactId,
        titleFieldId: titleFieldId ?? null,
        title: title ?? null,
        descriptionFieldId: descriptionFieldId ?? null,
        description: description ?? null,
        statusFieldId: statusFieldId ?? null,
        statusBindValueId: statusBindValueId ?? null
      })
      return { ok: true }
    }
  )
}
