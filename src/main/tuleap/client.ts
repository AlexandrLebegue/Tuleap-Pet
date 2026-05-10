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
  gitBranchSchema,
  gitCommitSchema,
  gitRepositorySchema,
  milestoneContentItemSchema,
  milestoneSchema,
  projectSchema,
  pullRequestCreatedSchema,
  trackerSchema,
  trackerStructureSchema,
  userSelfSchema,
  type ArtifactDetailRaw,
  type ArtifactSummaryRaw,
  type GitBranchRaw,
  type GitCommitRaw,
  type GitRepositoryRaw,
  type MilestoneContentItemRaw,
  type MilestoneRaw,
  type ProjectRaw,
  type TrackerRaw,
  type TrackerStructureRaw,
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

export type TuleapAuthHeader = 'X-Auth-AccessKey' | 'Authorization'

export type TuleapClientOptions = {
  baseUrl: string
  token: string
  /** Defaults to 'X-Auth-AccessKey' (personal token); 'Authorization' for OAuth2 bearer. */
  authHeader?: TuleapAuthHeader
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
  private readonly authHeader: TuleapAuthHeader
  private readonly fetchImpl: FetchLike
  private readonly timeoutMs: number

  constructor(opts: TuleapClientOptions) {
    if (!opts.baseUrl) throw new Error('baseUrl manquant')
    if (!opts.token) throw new Error('token manquant')
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.token = opts.token
    this.authHeader = opts.authHeader ?? 'X-Auth-AccessKey'
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  private async mutate(method: 'POST' | 'PUT', path: string, body: unknown): Promise<Response> {
    const url = buildUrl(this.baseUrl, path)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
    if (this.authHeader === 'Authorization') {
      headers['Authorization'] = `Bearer ${this.token}`
    } else {
      headers['X-Auth-AccessKey'] = this.token
    }
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: JSON.stringify(body),
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
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new TuleapServerError(
        `Tuleap a renvoyé HTTP ${response.status}: ${text.slice(0, 300)}`,
        response.status
      )
    }
    return response
  }

  private async request(path: string, params?: Record<string, unknown>): Promise<Response> {
    const url = buildUrl(this.baseUrl, path, params)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (this.authHeader === 'Authorization') {
      headers['Authorization'] = `Bearer ${this.token}`
    } else {
      headers['X-Auth-AccessKey'] = this.token
    }
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers,
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
    return this.json(artifactDetailSchema, `/api/artifacts/${id}`, {
      values_format: 'collection',
      tracker_structure_format: 'minimal'
    })
  }

  listLinkedArtifacts(
    artifactId: number,
    opts?: { nature?: string; direction?: 'forward' | 'reverse' } & Pagination
  ): Promise<PaginatedResponse<ArtifactSummaryRaw>> {
    return this.paginated(artifactSummarySchema, `/api/artifacts/${artifactId}/linked_artifacts`, {
      nature: opts?.nature ?? '_is_child',
      direction: opts?.direction ?? 'forward',
      limit: opts?.limit ?? DEFAULT_PAGE_LIMIT,
      offset: opts?.offset ?? 0
    })
  }

  countArtifacts(trackerId: number): Promise<number | null> {
    return this.listArtifacts(trackerId, { limit: 1, offset: 0 }).then((page) => page.total)
  }

  listMilestones(
    projectId: number,
    opts?: Pagination & { status?: 'open' | 'closed' | 'all' }
  ): Promise<PaginatedResponse<MilestoneRaw>> {
    const params: Record<string, unknown> = {
      limit: opts?.limit ?? DEFAULT_PAGE_LIMIT,
      offset: opts?.offset ?? 0
    }
    const status = opts?.status ?? 'open'
    if (status !== 'all') {
      params['query'] = JSON.stringify({ status })
    }
    return this.paginated(milestoneSchema, `/api/projects/${projectId}/milestones`, params)
  }

  getMilestone(id: number): Promise<MilestoneRaw> {
    return this.json(milestoneSchema, `/api/milestones/${id}`)
  }

  /**
   * Items linked to a milestone (user stories, tasks, …).
   * Tuleap exposes them as backlog items on /api/milestones/{id}/content.
   * The response shape may differ from standard artifacts (missing uri/tracker).
   */
  listMilestoneContent(
    milestoneId: number,
    opts?: Pagination
  ): Promise<PaginatedResponse<MilestoneContentItemRaw>> {
    return this.paginated(milestoneContentItemSchema, `/api/milestones/${milestoneId}/content`, {
      limit: opts?.limit ?? DEFAULT_PAGE_LIMIT,
      offset: opts?.offset ?? 0
    })
  }

  getTrackerFields(trackerId: number): Promise<TrackerStructureRaw> {
    return this.json(trackerStructureSchema, `/api/trackers/${trackerId}`)
  }

  async createArtifact(args: {
    trackerId: number
    titleFieldId: number
    title: string
    statusFieldId: number | null
    statusBindValueId: number | null
    descriptionFieldId: number | null
    description: string | null
  }): Promise<{ id: number }> {
    const values: unknown[] = [{ field_id: args.titleFieldId, value: args.title }]
    if (args.statusFieldId !== null && args.statusBindValueId !== null) {
      values.push({ field_id: args.statusFieldId, bind_value_ids: [args.statusBindValueId] })
    }
    if (args.descriptionFieldId !== null && args.description !== null) {
      values.push({
        field_id: args.descriptionFieldId,
        value: { content: args.description, format: 'text' }
      })
    }
    const response = await this.mutate('POST', '/api/artifacts', {
      tracker: { id: args.trackerId },
      values
    })
    let raw: unknown
    try {
      raw = await response.json()
    } catch {
      throw new TuleapSchemaError('Réponse non-JSON pour POST /api/artifacts')
    }
    const parsed = z.object({ id: z.number() }).passthrough().safeParse(raw)
    if (!parsed.success) {
      throw new TuleapSchemaError(`Réponse création artifact invalide: ${parsed.error.message}`)
    }
    return { id: parsed.data.id }
  }

  async updateArtifactStatus(args: {
    artifactId: number
    statusFieldId: number
    statusBindValueId: number
  }): Promise<void> {
    await this.mutate('PUT', `/api/artifacts/${args.artifactId}`, {
      values: [{ field_id: args.statusFieldId, bind_value_ids: [args.statusBindValueId] }]
    })
  }

  async updateArtifact(args: {
    artifactId: number
    titleFieldId: number | null
    title: string | null
    descriptionFieldId: number | null
    description: string | null
    statusFieldId: number | null
    statusBindValueId: number | null
  }): Promise<void> {
    const values: unknown[] = []
    if (args.titleFieldId !== null && args.title !== null) {
      values.push({ field_id: args.titleFieldId, value: args.title })
    }
    if (args.descriptionFieldId !== null && args.description !== null) {
      values.push({ field_id: args.descriptionFieldId, value: { content: args.description, format: 'text' } })
    }
    if (args.statusFieldId !== null && args.statusBindValueId !== null) {
      values.push({ field_id: args.statusFieldId, bind_value_ids: [args.statusBindValueId] })
    }
    if (values.length === 0) return
    await this.mutate('PUT', `/api/artifacts/${args.artifactId}`, { values })
  }

  async listGitRepositories(
    projectId: number,
    opts?: Pagination
  ): Promise<PaginatedResponse<GitRepositoryRaw>> {
    const limit = opts?.limit ?? DEFAULT_PAGE_LIMIT
    const offset = opts?.offset ?? 0
    const path = `/api/projects/${projectId}/git`
    const response = await this.request(path, { limit, offset })
    const totalHeader = response.headers.get('X-PAGINATION-SIZE')
    const total = totalHeader ? Number.parseInt(totalHeader, 10) : Number.NaN
    let raw: unknown
    try {
      raw = await response.json()
    } catch {
      throw new TuleapSchemaError(`Réponse non-JSON pour ${path}`)
    }
    // Tuleap may return a plain array or wrap repos in { repositories: [...] }
    const itemsRaw = Array.isArray(raw)
      ? raw
      : (raw as Record<string, unknown> | null)?.['repositories'] ?? []
    const parsed = arrayOf(gitRepositorySchema).safeParse(itemsRaw)
    if (!parsed.success) {
      throw new TuleapSchemaError(
        `Réponse Tuleap invalide pour ${path}: ${parsed.error.message.slice(0, 300)}\nPremier item brut: ${JSON.stringify(Array.isArray(itemsRaw) ? itemsRaw[0] : itemsRaw).slice(0, 500)}`
      )
    }
    return {
      items: parsed.data,
      total: Number.isFinite(total) ? total : parsed.data.length,
      limit,
      offset
    }
  }

  listBranches(
    repoId: number,
    opts?: Pagination
  ): Promise<PaginatedResponse<GitBranchRaw>> {
    return this.paginated(gitBranchSchema, `/api/git/${repoId}/branches`, {
      limit: opts?.limit ?? DEFAULT_PAGE_LIMIT,
      offset: opts?.offset ?? 0
    })
  }

  listCommits(
    repoId: number,
    opts?: Pagination & { refName?: string }
  ): Promise<PaginatedResponse<GitCommitRaw>> {
    const params: Record<string, unknown> = {
      limit: opts?.limit ?? DEFAULT_PAGE_LIMIT,
      offset: opts?.offset ?? 0
    }
    if (opts?.refName) params['ref_name'] = opts.refName
    return this.paginated(gitCommitSchema, `/api/git/${repoId}/commits`, params)
  }

  async createPullRequest(args: {
    repoId: number
    sourceBranch: string
    targetBranch: string
  }): Promise<{ id: number; htmlUrl: string }> {
    const response = await this.mutate('POST', '/api/pull_requests', {
      repository_id: args.repoId,
      branch_src: args.sourceBranch,
      repository_dest_id: args.repoId,
      branch_dest: args.targetBranch
    })
    let raw: unknown
    try {
      raw = await response.json()
    } catch {
      throw new TuleapSchemaError('Réponse non-JSON pour POST /api/pull_requests')
    }
    const parsed = pullRequestCreatedSchema.safeParse(raw)
    if (!parsed.success) {
      throw new TuleapSchemaError(`Réponse PR invalide: ${parsed.error.message.slice(0, 300)}`)
    }
    return { id: parsed.data.id, htmlUrl: parsed.data.html_url ?? '' }
  }

  /** Fetch every page of a paginated endpoint and return a flat array of all items. */
  async fetchAll<T>(fetcher: (offset: number) => Promise<PaginatedResponse<T>>): Promise<T[]> {
    const all: T[] = []
    let offset = 0
    while (true) {
      const page = await fetcher(offset)
      all.push(...page.items)
      if (page.items.length === 0 || all.length >= page.total) break
      offset += page.items.length
    }
    return all
  }
}
