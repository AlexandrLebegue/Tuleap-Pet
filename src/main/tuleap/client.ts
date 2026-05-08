import { z, type ZodTypeAny } from 'zod'
import {
  TuleapAuthError,
  TuleapError,
  TuleapNetworkError,
  TuleapNotFoundError,
  TuleapSchemaError,
  TuleapServerError
} from './errors'
import {
  artifactDetailSchema,
  artifactSummarySchema,
  arrayOf,
  projectSchema,
  trackerSchema,
  userSelfSchema,
  type ArtifactDetailRaw,
  type ArtifactSummaryRaw,
  type ProjectRaw,
  type TrackerRaw,
  type UserSelf
} from './schemas'

export type Pagination = {
  limit?: number
  offset?: number
}

export type PaginatedResponse<T> = {
  items: T[]
  total: number
  limit: number
  offset: number
}

type FetchLike = typeof globalThis.fetch

export type TuleapClientOptions = {
  baseUrl: string
  token: string
  fetchImpl?: FetchLike
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_PAGE_LIMIT = 50

function buildUrl(baseUrl: string, path: string, params?: Record<string, unknown>): string {
  const cleanBase = baseUrl.replace(/\/+$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(cleanBase + cleanPath)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

export class TuleapClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly fetchImpl: FetchLike
  private readonly timeoutMs: number

  constructor(opts: TuleapClientOptions) {
    if (!opts.baseUrl) throw new Error('baseUrl manquant')
    if (!opts.token) throw new Error('token manquant')
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.token = opts.token
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  private async request(path: string, params?: Record<string, unknown>): Promise<Response> {
    const url = buildUrl(this.baseUrl, path, params)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          'X-Auth-AccessKey': this.token,
          Accept: 'application/json'
        },
        signal: controller.signal
      })
    } catch (err) {
      if (err instanceof TuleapError) throw err
      const message = err instanceof Error ? err.message : String(err)
      throw new TuleapNetworkError(`Erreur réseau vers ${url}: ${message}`)
    } finally {
      clearTimeout(timer)
    }
    if (response.status === 401 || response.status === 403) {
      throw new TuleapAuthError(
        `Authentification refusée par Tuleap (HTTP ${response.status}).`,
        response.status
      )
    }
    if (response.status === 404) {
      throw new TuleapNotFoundError(`Ressource introuvable: ${path}`, 404)
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new TuleapServerError(
        `Tuleap a renvoyé HTTP ${response.status}: ${text.slice(0, 300)}`,
        response.status
      )
    }
    return response
  }

  private async json<S extends ZodTypeAny>(
    schema: S,
    path: string,
    params?: Record<string, unknown>
  ): Promise<z.infer<S>> {
    const response = await this.request(path, params)
    let raw: unknown
    try {
      raw = await response.json()
    } catch {
      throw new TuleapSchemaError(`Réponse non-JSON pour ${path}`)
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      throw new TuleapSchemaError(
        `Réponse Tuleap invalide pour ${path}: ${parsed.error.message.slice(0, 300)}`
      )
    }
    return parsed.data
  }

  private async paginated<S extends ZodTypeAny>(
    schema: S,
    path: string,
    params?: Record<string, unknown>
  ): Promise<PaginatedResponse<z.infer<S>>> {
    const limit = (params?.['limit'] as number | undefined) ?? DEFAULT_PAGE_LIMIT
    const offset = (params?.['offset'] as number | undefined) ?? 0
    const response = await this.request(path, { ...params, limit, offset })
    const totalHeader = response.headers.get('X-PAGINATION-SIZE')
    const total = totalHeader ? Number.parseInt(totalHeader, 10) : Number.NaN
    let raw: unknown
    try {
      raw = await response.json()
    } catch {
      throw new TuleapSchemaError(`Réponse non-JSON pour ${path}`)
    }
    const parsed = arrayOf(schema).safeParse(raw)
    if (!parsed.success) {
      throw new TuleapSchemaError(
        `Réponse Tuleap invalide pour ${path}: ${parsed.error.message.slice(0, 300)}`
      )
    }
    return {
      items: parsed.data,
      total: Number.isFinite(total) ? total : parsed.data.length,
      limit,
      offset
    }
  }

  // ---- Endpoints ------------------------------------------------------

  getSelf(): Promise<UserSelf> {
    return this.json(userSelfSchema, '/api/users/self')
  }

  listProjects(opts?: Pagination & { query?: string }): Promise<PaginatedResponse<ProjectRaw>> {
    const params: Record<string, unknown> = {
      limit: opts?.limit ?? DEFAULT_PAGE_LIMIT,
      offset: opts?.offset ?? 0
    }
    if (opts?.query && opts.query.trim().length > 0) {
      params['query'] = JSON.stringify({ shortname: opts.query.trim() })
    }
    return this.paginated(projectSchema, '/api/projects', params)
  }

  getProject(id: number): Promise<ProjectRaw> {
    return this.json(projectSchema, `/api/projects/${id}`)
  }

  listTrackers(projectId: number, opts?: Pagination): Promise<PaginatedResponse<TrackerRaw>> {
    return this.paginated(trackerSchema, `/api/projects/${projectId}/trackers`, {
      limit: opts?.limit ?? DEFAULT_PAGE_LIMIT,
      offset: opts?.offset ?? 0
    })
  }

  getTracker(id: number): Promise<TrackerRaw> {
    return this.json(trackerSchema, `/api/trackers/${id}`)
  }

  listArtifacts(
    trackerId: number,
    opts?: Pagination & { values?: 'all' | 'summary' | 'none' }
  ): Promise<PaginatedResponse<ArtifactSummaryRaw>> {
    return this.paginated(artifactSummarySchema, `/api/trackers/${trackerId}/artifacts`, {
      limit: opts?.limit ?? DEFAULT_PAGE_LIMIT,
      offset: opts?.offset ?? 0,
      values: opts?.values ?? 'all'
    })
  }

  getArtifact(id: number): Promise<ArtifactDetailRaw> {
    return this.json(artifactDetailSchema, `/api/artifacts/${id}`)
  }

  countArtifacts(trackerId: number): Promise<number | null> {
    return this.listArtifacts(trackerId, { limit: 1, offset: 0 }).then((page) => page.total)
  }
}
