import { z, type ZodTypeAny } from 'zod'
import {
  JenkinsAuthError,
  JenkinsError,
  JenkinsNetworkError,
  JenkinsNotFoundError,
  JenkinsSchemaError,
  JenkinsServerError
} from './errors'
import {
  jenkinsBranchBuildSchema,
  jenkinsBuildSchema,
  jenkinsComputerSchema,
  jenkinsJobListSchema,
  jenkinsQueueSchema,
  jenkinsRootSchema,
  jenkinsTestReportSchema,
  jenkinsWhoAmISchema,
  type JenkinsBuildRaw,
  type JenkinsJobRaw,
  type JenkinsTestReportRaw
} from './schemas'
import type {
  JenkinsBranchStatus,
  JenkinsBuildDetail,
  JenkinsBuildResult,
  JenkinsBuildSummary,
  JenkinsDiscoveredJob,
  JenkinsJob,
  JenkinsNode,
  JenkinsQueueItem
} from '@shared/types'
import { debugLog, debugWarn } from '../logger'

type FetchLike = typeof globalThis.fetch

export type JenkinsClientOptions = {
  baseUrl: string
  username: string
  apiToken: string
  fetchImpl?: FetchLike
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 20_000
// Some corporate reverse proxies / WAFs return 404 (or block) requests that do
// not carry a browser-like User-Agent. Send a realistic one to avoid that.
const JENKINS_USER_AGENT =
  'Mozilla/5.0 (Tuleap-Companion) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const FOLDER_CLASSES = [
  'WorkflowMultiBranchProject',
  'OrganizationFolder',
  'com.cloudbees.hudson.plugins.folder.Folder'
]

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

function toIso(timestampMs: number): string {
  return new Date(timestampMs).toISOString()
}

function toBuildResult(raw: string | null | undefined): JenkinsBuildResult {
  if (
    raw === 'SUCCESS' ||
    raw === 'FAILURE' ||
    raw === 'UNSTABLE' ||
    raw === 'ABORTED' ||
    raw === 'NOT_BUILT'
  ) {
    return raw
  }
  return null
}

function isFolder(jobClass: string): boolean {
  return FOLDER_CLASSES.some((fc) => jobClass.includes(fc))
}

function jobSegments(jobName: string): string {
  // "Folder/Sub/Job" → "job/Folder/job/Sub/job/Job" (handles arbitrary depth)
  return jobName.split('/').map(s => `job/${encodeURIComponent(s.trim())}`).join('/')
}

/**
 * Detect what kind of secret was configured. Matters when Jenkins delegates
 * auth to Tuleap (tuleap-oauth plugin): a plain Jenkins API token authenticates
 * but carries no Tuleap project groups (→ 404 on protected folders), whereas a
 * Tuleap access key (tlp.k1.…) is validated against Tuleap and resolves groups.
 */
function classifyToken(token: string): 'jenkins-api-token' | 'tuleap-access-key' | 'unknown' {
  if (/^tlp\.k\d+\./i.test(token.trim())) return 'tuleap-access-key'
  if (/^11[0-9a-f]{32}$/i.test(token.trim())) return 'jenkins-api-token'
  return 'unknown'
}

/**
 * Classify a Jenkins job by its _class string so the crawler knows whether to
 * descend into it (folder / organization folder) or collect it as selectable
 * (multibranch project or leaf job). Substring match keeps it resilient to
 * plugin-specific class names (incl. the Tuleap organization folder plugin).
 */
function classifyJob(jobClass: string): 'folder' | 'multibranch' | 'job' {
  const c = (jobClass ?? '').toLowerCase()
  if (c.includes('multibranch')) return 'multibranch'
  if (c.includes('folder')) return 'folder'
  return 'job'
}

function mapJob(raw: JenkinsJobRaw): JenkinsJob {
  const lb = raw.lastBuild ?? null
  return {
    name: raw.name,
    displayName: raw.displayName ?? raw.name,
    url: raw.url,
    color: raw.color ?? 'grey',
    lastBuildNumber: lb?.number ?? null,
    lastBuildTimestamp: lb?.timestamp != null ? toIso(lb.timestamp) : null,
    lastBuildResult: toBuildResult(lb?.result),
    isFolder: isFolder(raw._class ?? ''),
    jobClass: raw._class ?? ''
  }
}

function extractParameters(
  actions: unknown[]
): Array<{ name: string; value: string | number | boolean | null; type: string }> {
  for (const action of actions) {
    if (
      action != null &&
      typeof action === 'object' &&
      '_class' in action &&
      typeof (action as Record<string, unknown>)['_class'] === 'string' &&
      ((action as Record<string, unknown>)['_class'] as string).includes('ParametersAction')
    ) {
      const params = (action as Record<string, unknown>)['parameters']
      if (Array.isArray(params)) {
        return params.map((p: unknown) => {
          const param = p as Record<string, unknown>
          return {
            name: String(param['name'] ?? ''),
            value: (param['value'] as string | number | boolean | null) ?? null,
            type: String(param['_class'] ?? 'StringParameterValue')
          }
        })
      }
    }
  }
  return []
}

function extractTestReport(
  actions: unknown[]
): { totalCount: number; failCount: number; skipCount: number; passCount: number } | null {
  for (const action of actions) {
    if (
      action != null &&
      typeof action === 'object' &&
      '_class' in action &&
      typeof (action as Record<string, unknown>)['_class'] === 'string' &&
      ((action as Record<string, unknown>)['_class'] as string).includes('TestResultAction')
    ) {
      const a = action as Record<string, unknown>
      const total = typeof a['totalCount'] === 'number' ? a['totalCount'] : 0
      const fail = typeof a['failCount'] === 'number' ? a['failCount'] : 0
      const skip = typeof a['skipCount'] === 'number' ? a['skipCount'] : 0
      return {
        totalCount: total,
        failCount: fail,
        skipCount: skip,
        passCount: total - fail - skip
      }
    }
  }
  return null
}

function mapBuildDetail(raw: JenkinsBuildRaw, jobName: string): JenkinsBuildDetail {
  const actions = raw.actions ?? []
  return {
    number: raw.number,
    url: raw.url,
    result: toBuildResult(raw.result),
    duration: raw.building ? null : raw.duration ?? 0,
    timestamp: toIso(raw.timestamp),
    displayName: raw.displayName ?? `#${raw.number}`,
    building: raw.building ?? false,
    jobName,
    description: raw.description ?? null,
    fullDisplayName: raw.fullDisplayName ?? `${jobName} #${raw.number}`,
    consoleUrl: `${raw.url}console`,
    parameters: extractParameters(actions),
    testReport: extractTestReport(actions)
  }
}

function mapBuildSummary(raw: JenkinsBuildRaw): JenkinsBuildSummary {
  return {
    number: raw.number,
    url: raw.url,
    result: toBuildResult(raw.result),
    duration: raw.building ? null : raw.duration ?? 0,
    timestamp: toIso(raw.timestamp),
    displayName: raw.displayName ?? `#${raw.number}`,
    building: raw.building ?? false
  }
}

function parseCoverageData(data: Record<string, unknown>): { lineCoverage: number | null; branchCoverage: number | null } {
  let lineCoverage: number | null = null
  let branchCoverage: number | null = null

  // JaCoCo: { lineCoverage: 78.3, branchCoverage: 61.0 }
  if (typeof data['lineCoverage'] === 'number') lineCoverage = data['lineCoverage']
  if (typeof data['branchCoverage'] === 'number') branchCoverage = data['branchCoverage']

  const results = data['results']

  // Coverage plugin: { results: [{value: "78.3", name: "Line"}, ...] }
  if (Array.isArray(results)) {
    for (const r of results as Array<Record<string, unknown>>) {
      const name = String(r['name'] ?? '').toLowerCase()
      const value = parseFloat(String(r['value'] ?? ''))
      if (!isNaN(value)) {
        if (name === 'line' || name === 'lines') lineCoverage = value
        if (name === 'branch' || name === 'branches') branchCoverage = value
      }
    }
  } else if (results !== null && typeof results === 'object') {
    // Cobertura: { results: { elements: [{name: "Lines", ratio: 78.3}, ...] } }
    const elements = (results as Record<string, unknown>)['elements']
    if (Array.isArray(elements)) {
      for (const e of elements as Array<Record<string, unknown>>) {
        const name = String(e['name'] ?? '').toLowerCase()
        const ratio = typeof e['ratio'] === 'number' ? e['ratio'] : null
        if (ratio !== null) {
          if (name === 'lines') lineCoverage = ratio
          if (name === 'branches') branchCoverage = ratio
        }
      }
    }
  }

  return { lineCoverage, branchCoverage }
}

export class JenkinsClient {
  readonly baseUrl: string
  /** What the configured secret looks like — drives SSO diagnostics in the UI. */
  readonly tokenKind: 'jenkins-api-token' | 'tuleap-access-key' | 'unknown'
  private readonly authHeader: string
  private readonly fetchImpl: FetchLike
  private readonly timeoutMs: number

  constructor(opts: JenkinsClientOptions) {
    if (!opts.baseUrl) throw new Error('baseUrl manquant')
    if (!opts.username) throw new Error('username manquant')
    if (!opts.apiToken) throw new Error('apiToken manquant')
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.tokenKind = classifyToken(opts.apiToken)
    this.authHeader = `Basic ${Buffer.from(`${opts.username}:${opts.apiToken}`).toString('base64')}`
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
          Accept: 'application/json',
          Authorization: this.authHeader,
          'User-Agent': JENKINS_USER_AGENT
        },
        redirect: 'manual',
        signal: controller.signal
      })
    } catch (err) {
      if (err instanceof JenkinsError) throw err
      const message = err instanceof Error ? err.message : String(err)
      throw new JenkinsNetworkError(`Erreur réseau vers ${url}: ${message}`)
    } finally {
      clearTimeout(timer)
    }
    debugLog('[jenkins] GET %s → HTTP %d', url, response.status)
    if (response.status === 401 || response.status === 403) {
      const hint =
        this.tokenKind === 'tuleap-access-key'
          ? "Clé d'accès Tuleap rejetée (401) — vérifiez : scope OpenID Connect activé, clé non expirée, nom d'utilisateur = login Tuleap exact."
          : this.tokenKind === 'jenkins-api-token'
            ? 'Token API Jenkins rejeté (401) — vérifiez que le token est valide et non révoqué.'
            : `Identifiants refusés (HTTP ${response.status}) — vérifiez le nom d'utilisateur et le token.`
      debugWarn('[jenkins] AUTH %d %s — tokenKind=%s hint: %s', response.status, url, this.tokenKind, hint)
      throw new JenkinsAuthError(hint, response.status)
    }
    // A 3xx redirect on an API endpoint almost always means the request was not
    // authenticated and Jenkins (or an SSO proxy) is bouncing to a login page.
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location') ?? '?'
      throw new JenkinsAuthError(
        `Jenkins a redirigé ${url} vers ${location} (HTTP ${response.status}). ` +
          `L'authentification par token n'a probablement pas été acceptée (SSO/proxy ?).`,
        response.status
      )
    }
    if (response.status === 404) {
      debugWarn(
        '[jenkins] 404 sur %s — la ressource existe peut-être mais le token ' +
          "n'a pas le droit Discover/Read (Jenkins masque l'existence en 404).",
        url
      )
      throw new JenkinsNotFoundError(`Ressource Jenkins introuvable: ${path}`, 404)
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new JenkinsServerError(
        `Jenkins a renvoyé HTTP ${response.status}: ${text.slice(0, 300)}`,
        response.status
      )
    }
    return response
  }

  private async requestText(path: string): Promise<string> {
    const url = buildUrl(this.baseUrl, path)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: this.authHeader, 'User-Agent': JENKINS_USER_AGENT },
        redirect: 'manual',
        signal: controller.signal
      })
    } catch (err) {
      if (err instanceof JenkinsError) throw err
      const message = err instanceof Error ? err.message : String(err)
      throw new JenkinsNetworkError(`Erreur réseau vers ${url}: ${message}`)
    } finally {
      clearTimeout(timer)
    }
    if (response.status === 401 || response.status === 403) {
      throw new JenkinsAuthError(
        `Authentification refusée par Jenkins (HTTP ${response.status}).`,
        response.status
      )
    }
    if (response.status === 404) {
      throw new JenkinsNotFoundError(`Ressource Jenkins introuvable: ${path}`, 404)
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new JenkinsServerError(
        `Jenkins a renvoyé HTTP ${response.status}: ${text.slice(0, 300)}`,
        response.status
      )
    }
    return response.text()
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
      throw new JenkinsSchemaError(`Réponse non-JSON pour ${path}`)
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      throw new JenkinsSchemaError(
        `Réponse Jenkins invalide pour ${path}: ${parsed.error.message.slice(0, 300)}`
      )
    }
    return parsed.data
  }

  async testConnection(): Promise<{
    version: string
    nodeName: string
    whoAmIName: string
    authorities: string[]
    missingGroups: boolean
    tokenKind: 'jenkins-api-token' | 'tuleap-access-key' | 'unknown'
  }> {
    const [root, whoAmI] = await Promise.all([
      this.json(jenkinsRootSchema, '/api/json', { tree: 'nodeName,version' }),
      this.json(jenkinsWhoAmISchema, '/whoAmI/api/json', {
        tree: 'name,authenticated,anonymous,authorities'
      }).catch(() => ({ name: '', authenticated: false, anonymous: true, authorities: [] }))
    ])
    const authorities: string[] = whoAmI.authorities ?? []
    const missingGroups =
      authorities.length === 0 ||
      (authorities.length === 1 && (authorities[0] ?? '').toLowerCase() === 'authenticated')
    if (missingGroups) {
      if (this.tokenKind === 'jenkins-api-token') {
        debugWarn(
          '[jenkins] testConnection: authorities=%s avec un token API Jenkins — ' +
            'si Jenkins délègue son authentification à Tuleap (plugin tuleap-oauth), ' +
            'les groupes de projet Tuleap ne sont pas résolus et les dossiers protégés renvoient 404. ' +
            "Solution : utiliser une clé d'accès Tuleap (tlp.k1.…, scope OpenID Connect) à la place du token Jenkins.",
          JSON.stringify(authorities)
        )
      } else {
        debugWarn(
          '[jenkins] testConnection: authorities=%s — pas de groupes résolus pour %s (tokenKind=%s). ' +
            "L'accès aux dossiers protégés échouera en 404.",
          JSON.stringify(authorities),
          whoAmI.name,
          this.tokenKind
        )
      }
    } else {
      debugLog(
        '[jenkins] testConnection: utilisateur=%s authorities=%s tokenKind=%s',
        whoAmI.name,
        JSON.stringify(authorities),
        this.tokenKind
      )
    }
    return {
      version: root.version,
      nodeName: root.nodeName,
      whoAmIName: whoAmI.name,
      authorities,
      missingGroups,
      tokenKind: this.tokenKind
    }
  }

  async listJobs(folder?: string): Promise<JenkinsJob[]> {
    const basePath = folder ? `/${jobSegments(folder)}/api/json` : '/api/json'
    const data = await this.json(jenkinsJobListSchema, basePath, {
      tree: 'jobs[name,displayName,url,color,_class,lastBuild[number,result,timestamp]]',
      depth: '1'
    })
    return (data.jobs ?? []).map(mapJob)
  }

  /**
   * Recursively crawl the whole Jenkins instance (or a sub-folder) and return a
   * flat, exhaustive list of selectable jobs (multibranch projects + leaf jobs).
   * Descends into plain folders and organization folders; does NOT descend into
   * multibranch projects (their children are branches, not selectable targets).
   * Robust: a 404/403 on a sub-folder is logged and skipped, never fatal.
   */
  async discoverJobs(rootFolder = '', maxDepth = 8): Promise<JenkinsDiscoveredJob[]> {
    const out: JenkinsDiscoveredJob[] = []
    const visit = async (folder: string, depth: number): Promise<void> => {
      if (depth > maxDepth) {
        debugWarn('[jenkins] discover: profondeur max atteinte à %s', folder || '<root>')
        return
      }
      debugLog('[jenkins] discover: liste %s (profondeur %d)', folder || '<root>', depth)
      let jobs: JenkinsJob[]
      try {
        jobs = await this.listJobs(folder || undefined)
      } catch (err) {
        debugWarn(
          '[jenkins] discover: ignore %s — %s',
          folder || '<root>',
          err instanceof Error ? err.message : String(err)
        )
        return
      }
      debugLog('[jenkins] discover: %d entrée(s) dans %s', jobs.length, folder || '<root>')
      for (const j of jobs) {
        const fullPath = folder ? `${folder}/${j.name}` : j.name
        const kind = classifyJob(j.jobClass)
        debugLog('[jenkins] discover:  → %s  _class=%s  kind=%s', fullPath, j.jobClass, kind)
        if (kind === 'folder') {
          await visit(fullPath, depth + 1)
        } else {
          out.push({
            fullPath,
            name: j.name,
            displayName: j.displayName,
            url: j.url,
            kind,
            color: j.color
          })
        }
      }
    }
    await visit(rootFolder, 0)
    debugLog('[jenkins] discover: %d job(s) sélectionnable(s) au total', out.length)
    return out
  }

  /** Lightweight existence/validation check for a (possibly nested) job path. */
  async jobExists(
    jobPath: string
  ): Promise<{ exists: boolean; kind: string | null; url: string | null }> {
    try {
      const data = await this.json(
        z.object({ _class: z.string().optional(), url: z.string().optional() }).passthrough(),
        `/${jobSegments(jobPath)}/api/json`,
        { tree: '_class,url' }
      )
      return { exists: true, kind: data._class ?? null, url: data.url ?? null }
    } catch (err) {
      if (err instanceof JenkinsNotFoundError) return { exists: false, kind: null, url: null }
      throw err
    }
  }

  async getBranchStatus(jobName: string, branchName: string): Promise<JenkinsBranchStatus | null> {
    const encodedBranch = branchName.split('/').map(encodeURIComponent).join('%2F')
    const path = `/${jobSegments(jobName)}/job/${encodedBranch}/lastBuild/api/json`
    try {
      const data = await this.json(jenkinsBranchBuildSchema, path, {
        tree: 'number,result,timestamp,building,url'
      })
      return {
        branchName,
        buildNumber: data.number,
        result: toBuildResult(data.result),
        building: data.building ?? false,
        timestamp: toIso(data.timestamp),
        url: data.url
      }
    } catch (err) {
      if (err instanceof JenkinsNotFoundError) return null
      throw err
    }
  }

  async getBuildHistory(jobName: string, limit = 20): Promise<JenkinsBuildSummary[]> {
    const tree = `builds[number,url,result,duration,timestamp,displayName,building]{0,${limit}}`
    const data = await this.json(
      z.object({ builds: z.array(jenkinsBuildSchema).optional().default([]) }).passthrough(),
      `/${jobSegments(jobName)}/api/json`,
      { tree }
    )
    return (data.builds ?? []).map(mapBuildSummary)
  }

  async getBuildDetail(jobName: string, buildNumber: number): Promise<JenkinsBuildDetail> {
    const tree = [
      'number,url,result,duration,timestamp,displayName,building',
      'description,fullDisplayName,queueId,estimatedDuration',
      'actions[_class,parameters[name,value,_class],totalCount,failCount,skipCount]'
    ].join(',')
    const raw = await this.json(
      jenkinsBuildSchema,
      `/${jobSegments(jobName)}/${buildNumber}/api/json`,
      { tree }
    )
    return mapBuildDetail(raw, jobName)
  }

  async getConsoleText(jobName: string, buildNumber: number): Promise<string> {
    return this.requestText(`/${jobSegments(jobName)}/${buildNumber}/consoleText`)
  }

  async getQueue(): Promise<JenkinsQueueItem[]> {
    const data = await this.json(jenkinsQueueSchema, '/queue/api/json', {
      tree: 'items[id,why,inQueueSince,task[name,url],blocked,buildable,stuck]'
    })
    return (data.items ?? []).map((item) => ({
      id: item.id,
      why: item.why ?? null,
      inQueueSince: toIso(item.inQueueSince),
      jobName: item.task.name,
      jobUrl: item.task.url,
      blocked: item.blocked ?? false,
      buildable: item.buildable ?? false,
      stuck: item.stuck ?? false
    }))
  }

  async getTestReport(jobName: string, buildNumber: number): Promise<JenkinsTestReportRaw> {
    const tree =
      'duration,failCount,passCount,skipCount,suites[name,duration,cases[name,className,duration,status,errorDetails,errorStackTrace,skippedMessage]]'
    try {
      return await this.json(
        jenkinsTestReportSchema,
        `/${jobSegments(jobName)}/${buildNumber}/testReport/api/json`,
        { tree }
      )
    } catch (err) {
      if (err instanceof JenkinsNotFoundError) {
        throw new JenkinsError(
          'http',
          `Aucun rapport de test JUnit disponible pour ${jobName}#${buildNumber}.`
        )
      }
      throw err
    }
  }

  async getWarningsReport(
    jobName: string,
    buildNumber: number
  ): Promise<{ totalCount: number; tools: Array<{ name: string; count: number }> } | null> {
    try {
      const response = await this.request(
        `/${jobSegments(jobName)}/${buildNumber}/warnings-ng/api/json`,
        { tree: 'totalSize,groups[name,size]' }
      )
      const data = (await response.json()) as Record<string, unknown>
      const total = typeof data['totalSize'] === 'number' ? data['totalSize'] : 0
      const groups = Array.isArray(data['groups'])
        ? (data['groups'] as Array<Record<string, unknown>>)
        : []
      return {
        totalCount: total,
        tools: groups
          .map((g) => ({ name: String(g['name'] ?? ''), count: typeof g['size'] === 'number' ? g['size'] : 0 }))
          .filter((t) => t.count > 0)
      }
    } catch (err) {
      if (err instanceof JenkinsNotFoundError) return null
      throw err
    }
  }

  async getCoverageReport(
    jobName: string,
    buildNumber: number
  ): Promise<{ lineCoverage: number | null; branchCoverage: number | null } | null> {
    const endpoints = [
      { path: 'coverage', tree: 'results[value,name]' },
      { path: 'jacoco', tree: 'lineCoverage,branchCoverage' },
      { path: 'cobertura', tree: 'results[elements[name,ratio]]' }
    ]
    for (const { path, tree } of endpoints) {
      try {
        const response = await this.request(
          `/${jobSegments(jobName)}/${buildNumber}/${path}/api/json`,
          { tree }
        )
        const data = (await response.json()) as Record<string, unknown>
        const result = parseCoverageData(data)
        if (result.lineCoverage !== null || result.branchCoverage !== null) return result
      } catch (err) {
        if (err instanceof JenkinsNotFoundError) continue
        throw err
      }
    }
    return null
  }

  async getNodes(): Promise<JenkinsNode[]> {
    const data = await this.json(jenkinsComputerSchema, '/computer/api/json', {
      tree: [
        'computer[displayName,description,offline,temporarilyOffline,offlineCauseReason',
        'numExecutors,idle',
        'monitorData[hudson.node_monitors.ResponseTimeMonitor,hudson.node_monitors.DiskSpaceMonitor,hudson.node_monitors.SwapSpaceMonitor]]'
      ].join(',')
    })
    return (data.computer ?? []).map((node) => {
      const md = node.monitorData ?? {}
      const rtm = md['hudson.node_monitors.ResponseTimeMonitor'] as Record<string, unknown> | null
      const dsm = md['hudson.node_monitors.DiskSpaceMonitor'] as Record<string, unknown> | null
      const ssm = md['hudson.node_monitors.SwapSpaceMonitor'] as Record<string, unknown> | null
      let status: JenkinsNode['status'] = 'online'
      if (node.offline) status = node.temporarilyOffline ? 'temporarily-offline' : 'offline'
      return {
        displayName: node.displayName,
        description: node.description ?? null,
        offline: node.offline,
        temporarilyOffline: node.temporarilyOffline ?? false,
        offlineCauseReason: node.offlineCauseReason ?? null,
        status,
        numExecutors: node.numExecutors ?? 1,
        idle: node.idle ?? true,
        monitorData: {
          responseTime: typeof rtm?.['average'] === 'number' ? rtm['average'] : null,
          diskSpaceGb:
            typeof dsm?.['size'] === 'number'
              ? Math.round((dsm['size'] as number) / 1024 / 1024 / 1024 * 10) / 10
              : null,
          availableRamMb:
            typeof ssm?.['availablePhysicalMemory'] === 'number'
              ? Math.round((ssm['availablePhysicalMemory'] as number) / 1024 / 1024)
              : null
        }
      }
    })
  }
}
