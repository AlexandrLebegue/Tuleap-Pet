/**
 * Integration tests for exportBuildToTtm.
 *
 * Strategy: mock electron-store in-memory + inject custom fetchImpl into
 * JenkinsClient and TuleapClient — no real servers required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { JenkinsClient } from '../src/main/jenkins/client'
import { TuleapClient } from '../src/main/tuleap/client'
import type { JenkinsTtmExportProgress } from '@shared/types'

// Must be declared before imports that pull in ttm-cache (hoisted by vitest)
vi.mock('electron-store', () => ({
  default: class MockElectronStore {
    private data: Record<string, unknown>
    constructor(opts?: { defaults?: Record<string, unknown> }) {
      this.data = { ...(opts?.defaults ?? {}) }
    }
    get(key: string): unknown {
      return this.data[key]
    }
    set(key: string, value: unknown): void {
      this.data[key] = value
    }
  }
}))

// Import AFTER vi.mock so the hoisted mock is in place
import { exportBuildToTtm } from '../src/main/jenkins-ttm/exporter'
import { clearTtmCache } from '../src/main/jenkins-ttm/ttm-cache'

// ─── Constants ───────────────────────────────────────────────────────────────

const JENKINS_BASE = 'https://jenkins.example.com'
const TULEAP_BASE = 'https://tuleap.example.com'
const PROJECT_ID = 42
const TRACKER_ID = 10
const CAMPAIGN_ID = 99
const JOB_NAME = 'mon-api'
const BUILD_NUMBER = 87
const BUILD_URL = `${JENKINS_BASE}/job/mon-api/87/`

// ─── Helpers ─────────────────────────────────────────────────────────────────

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function paginatedRes(items: unknown[], total?: number): Response {
  const t = total ?? items.length
  return new Response(JSON.stringify(items), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-PAGINATION-SIZE': String(t),
      'X-PAGINATION-LIMIT': '100',
      'X-PAGINATION-OFFSET': '0'
    }
  })
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const TEST_REPORT_RESPONSE = {
  duration: 5.2,
  failCount: 1,
  passCount: 2,
  skipCount: 1,
  suites: [
    {
      name: 'com.example.AppTest',
      duration: 5.2,
      cases: [
        { name: 'testLogin', className: 'com.example.AppTest', status: 'PASSED', duration: 0.1 },
        { name: 'testLogout', className: 'com.example.AppTest', status: 'PASSED', duration: 0.2 },
        {
          name: 'testCheckout',
          className: 'com.example.AppTest',
          status: 'FAILED',
          duration: 0.3,
          errorDetails: 'AssertionError: expected 200 but was 500'
        },
        { name: 'testBeta', className: 'com.example.AppTest', status: 'SKIPPED', duration: 0 }
      ]
    }
  ]
}

const TRACKER_STRUCTURE_RESPONSE = {
  id: TRACKER_ID,
  fields: [
    { field_id: 1, label: 'Summary', type: 'string', values: null },
    { field_id: 2, label: 'Details', type: 'text', values: null }
  ],
  semantics: {
    title: { field_id: 1 },
    description: { field_id: 2 }
  }
}

const CAMPAIGN_RESPONSE = {
  id: CAMPAIGN_ID,
  label: 'test-campaign',
  uri: `testmanagement_campaigns/${CAMPAIGN_ID}`,
  status: 'open'
}

let artifactIdSeq = 1000
function nextArtifactId(): number {
  return ++artifactIdSeq
}

let executionIdSeq = 2000
function nextExecutionId(): number {
  return ++executionIdSeq
}

// ─── Fetch routers ────────────────────────────────────────────────────────────

function makeJenkinsFetch(): typeof globalThis.fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes(`/job/${JOB_NAME}/${BUILD_NUMBER}/testReport/api/json`)) {
      return jsonRes(TEST_REPORT_RESPONSE)
    }
    if (url.includes(`/job/${JOB_NAME}/404/testReport/api/json`)) {
      return new Response('Not Found', { status: 404 })
    }
    throw new Error(`Unexpected Jenkins fetch: ${url}`)
  }) as typeof globalThis.fetch
}

function makeTuleapFetch(opts: {
  existingArtifacts?: Array<{ id: number; title: string }>
  trackers?: Array<{ id: number; label: string; item_name: string }>
  trackerStructure?: typeof TRACKER_STRUCTURE_RESPONSE
  noTitleSemantic?: boolean
}): typeof globalThis.fetch {
  const artifacts = opts.existingArtifacts ?? []
  const trackers = opts.trackers ?? [
    { id: TRACKER_ID, label: 'Test Definitions', item_name: 'test', uri: `trackers/${TRACKER_ID}`, color: 'chrome-silver' }
  ]
  const structure = opts.noTitleSemantic
    ? { ...TRACKER_STRUCTURE_RESPONSE, semantics: {} }
    : (opts.trackerStructure ?? TRACKER_STRUCTURE_RESPONSE)

  const createdArtifacts: Array<{ id: number; title: string }> = [...artifacts]

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = (init?.method ?? 'GET').toUpperCase()

    // ── GET /api/projects/{id}/trackers  (auto-detect)
    if (method === 'GET' && url.includes(`/api/projects/${PROJECT_ID}/trackers`)) {
      const rawTrackers = trackers.map((t) => ({
        id: t.id,
        uri: (t as Record<string, unknown>).uri ?? `trackers/${t.id}`,
        label: t.label,
        item_name: t.item_name,
        color: (t as Record<string, unknown>).color ?? 'chrome-silver'
      }))
      return paginatedRes(rawTrackers, rawTrackers.length)
    }

    // ── GET /api/trackers/{id}/artifacts  (cache warm-up)
    if (method === 'GET' && url.includes(`/api/trackers/${TRACKER_ID}/artifacts`)) {
      const items = createdArtifacts.map((a) => ({
        id: a.id,
        uri: `artifacts/${a.id}`,
        title: a.title,
        status: null,
        tracker: { id: TRACKER_ID }
      }))
      return paginatedRes(items, items.length)
    }

    // ── GET /api/trackers/{id}  (tracker structure)
    if (method === 'GET' && url.includes(`/api/trackers/${TRACKER_ID}`) && !url.includes('/artifacts')) {
      return jsonRes(structure)
    }

    // ── POST /api/v1/testmanagement_campaigns  (create campaign)
    if (method === 'POST' && url.includes('/api/v1/testmanagement_campaigns') && !url.includes('/test_executions')) {
      return jsonRes(CAMPAIGN_RESPONSE)
    }

    // ── POST /api/artifacts  (create test definition)
    if (method === 'POST' && url.endsWith('/api/artifacts')) {
      const body = JSON.parse(init?.body as string)
      const titleValue = body.values?.find((v: { field_id: number }) => v.field_id === 1)
      const id = nextArtifactId()
      createdArtifacts.push({ id, title: titleValue?.value ?? '' })
      return jsonRes({ id, uri: `artifacts/${id}` }, 200)
    }

    // ── POST /api/v1/testmanagement_campaigns/{id}/test_executions
    if (method === 'POST' && url.includes('/test_executions')) {
      const id = nextExecutionId()
      const body = JSON.parse(init?.body as string)
      return jsonRes({ id, status: body.status ?? 'notrun' }, 200)
    }

    throw new Error(`Unexpected Tuleap fetch: ${method} ${url}`)
  }) as typeof globalThis.fetch
}

function makeClients(opts: Parameters<typeof makeTuleapFetch>[0] = {}): {
  jenkins: JenkinsClient
  tuleap: TuleapClient
} {
  return {
    jenkins: new JenkinsClient({
      baseUrl: JENKINS_BASE,
      username: 'ci-user',
      apiToken: 'abc123',
      fetchImpl: makeJenkinsFetch()
    }),
    tuleap: new TuleapClient({
      baseUrl: TULEAP_BASE,
      token: 'tlp.k1.fake',
      fetchImpl: makeTuleapFetch(opts)
    })
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearTtmCache()
  artifactIdSeq = 1000
  executionIdSeq = 2000
})

describe('exportBuildToTtm — happy path (explicit trackerId)', () => {
  it('returns correct counts for a 4-case report (2 passed, 1 failed, 1 skipped)', async () => {
    const { jenkins, tuleap } = makeClients()
    const events: JenkinsTtmExportProgress[] = []

    const result = await exportBuildToTtm(
      { jobName: JOB_NAME, buildNumber: BUILD_NUMBER, branchName: 'main', projectId: PROJECT_ID, buildUrl: BUILD_URL },
      jenkins,
      tuleap,
      TRACKER_ID,
      (e) => events.push(e)
    )

    expect(result.campaignId).toBe(CAMPAIGN_ID)
    expect(result.total).toBe(4)
    expect(result.passed).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.blocked).toBe(1)
    expect(result.newDefinitions).toBe(4) // all new — cache was empty
  })

  it('builds a campaignUrl pointing to Tuleap TTM plugin', async () => {
    const { jenkins, tuleap } = makeClients()
    const result = await exportBuildToTtm(
      { jobName: JOB_NAME, buildNumber: BUILD_NUMBER, branchName: 'main', projectId: PROJECT_ID, buildUrl: BUILD_URL },
      jenkins,
      tuleap,
      TRACKER_ID,
      () => {}
    )

    expect(result.campaignUrl).toContain(TULEAP_BASE)
    expect(result.campaignUrl).toContain(`group_id=${PROJECT_ID}`)
    expect(result.campaignUrl).toContain(`campaigns/${CAMPAIGN_ID}`)
  })

  it('emits start, progress × 4, and done events', async () => {
    const { jenkins, tuleap } = makeClients()
    const events: JenkinsTtmExportProgress[] = []

    await exportBuildToTtm(
      { jobName: JOB_NAME, buildNumber: BUILD_NUMBER, branchName: 'main', projectId: PROJECT_ID, buildUrl: BUILD_URL },
      jenkins,
      tuleap,
      TRACKER_ID,
      (e) => events.push(e)
    )

    const types = events.map((e) => e.type)
    expect(types[0]).toBe('start')
    expect(types[types.length - 1]).toBe('done')

    const progressEvents = events.filter((e) => e.type === 'progress')
    expect(progressEvents).toHaveLength(4)

    const startEvent = events[0]
    if (startEvent?.type === 'start') {
      expect(startEvent.total).toBe(4)
      expect(startEvent.campaignId).toBe(CAMPAIGN_ID)
    }

    const doneEvent = events[events.length - 1]
    if (doneEvent?.type === 'done') {
      expect(doneEvent.result.total).toBe(4)
    }
  })

  it('includes build URL in test execution result field', async () => {
    const tuleapFetch = makeTuleapFetch({})
    const { jenkins, tuleap } = {
      jenkins: new JenkinsClient({ baseUrl: JENKINS_BASE, username: 'u', apiToken: 't', fetchImpl: makeJenkinsFetch() }),
      tuleap: new TuleapClient({ baseUrl: TULEAP_BASE, token: 'tlp', fetchImpl: tuleapFetch })
    }

    await exportBuildToTtm(
      { jobName: JOB_NAME, buildNumber: BUILD_NUMBER, branchName: 'main', projectId: PROJECT_ID, buildUrl: BUILD_URL },
      jenkins,
      tuleap,
      TRACKER_ID,
      () => {}
    )

    const calls = vi.mocked(tuleapFetch).mock.calls
    const execCalls = calls.filter(([input, init]) => {
      const url = typeof input === 'string' ? input : input.toString()
      return (init?.method ?? 'GET').toUpperCase() === 'POST' && url.includes('/test_executions')
    })

    expect(execCalls.length).toBe(4)
    for (const [, init] of execCalls) {
      const body = JSON.parse(init?.body as string)
      expect(body.result ?? '').toContain(BUILD_URL)
    }
  })

  it('includes errorDetails in result for failed tests', async () => {
    const tuleapFetch = makeTuleapFetch({})
    const tuleap = new TuleapClient({ baseUrl: TULEAP_BASE, token: 'tlp', fetchImpl: tuleapFetch })
    const jenkins = new JenkinsClient({ baseUrl: JENKINS_BASE, username: 'u', apiToken: 't', fetchImpl: makeJenkinsFetch() })

    await exportBuildToTtm(
      { jobName: JOB_NAME, buildNumber: BUILD_NUMBER, branchName: 'main', projectId: PROJECT_ID, buildUrl: BUILD_URL },
      jenkins,
      tuleap,
      TRACKER_ID,
      () => {}
    )

    const calls = vi.mocked(tuleapFetch).mock.calls
    const execCalls = calls
      .filter(([input, init]) => {
        const url = typeof input === 'string' ? input : input.toString()
        return (init?.method ?? 'GET').toUpperCase() === 'POST' && url.includes('/test_executions')
      })
      .map(([, init]) => JSON.parse(init?.body as string))

    const failedExec = execCalls.find((b) => b.status === 'failed')
    expect(failedExec).toBeDefined()
    expect(failedExec?.result).toContain('AssertionError: expected 200 but was 500')
  })
})

describe('exportBuildToTtm — cache behaviour', () => {
  it('skips creating definitions for tests already in cache', async () => {
    // Pre-populate cache with existing definitions
    const existingArtifacts = [
      { id: 500, title: 'com.example.AppTest::testLogin' },
      { id: 501, title: 'com.example.AppTest::testLogout' }
    ]
    const { jenkins, tuleap } = makeClients({ existingArtifacts })

    const result = await exportBuildToTtm(
      { jobName: JOB_NAME, buildNumber: BUILD_NUMBER, branchName: 'main', projectId: PROJECT_ID, buildUrl: BUILD_URL },
      jenkins,
      tuleap,
      TRACKER_ID,
      () => {}
    )

    // 2 existing + 2 new (testCheckout + testBeta)
    expect(result.newDefinitions).toBe(2)
    expect(result.total).toBe(4)
  })

  it('does not call GET /artifacts again on second export (cache warmed)', async () => {
    const tuleapFetch = makeTuleapFetch({})
    const jenkins = new JenkinsClient({ baseUrl: JENKINS_BASE, username: 'u', apiToken: 't', fetchImpl: makeJenkinsFetch() })
    const tuleap = new TuleapClient({ baseUrl: TULEAP_BASE, token: 'tlp', fetchImpl: tuleapFetch })

    // First export — warms the cache
    await exportBuildToTtm(
      { jobName: JOB_NAME, buildNumber: BUILD_NUMBER, branchName: 'main', projectId: PROJECT_ID, buildUrl: BUILD_URL },
      jenkins,
      tuleap,
      TRACKER_ID,
      () => {}
    )

    const warmUpCalls1 = vi.mocked(tuleapFetch).mock.calls.filter(([input]) => {
      const url = typeof input === 'string' ? input : input.toString()
      return url.includes(`/api/trackers/${TRACKER_ID}/artifacts`) && !url.includes('POST')
    })

    // Second export — cache already warm, no second warm-up GET
    const tuleapFetch2 = makeTuleapFetch({})
    const tuleap2 = new TuleapClient({ baseUrl: TULEAP_BASE, token: 'tlp', fetchImpl: tuleapFetch2 })
    const jenkins2 = new JenkinsClient({ baseUrl: JENKINS_BASE, username: 'u', apiToken: 't', fetchImpl: makeJenkinsFetch() })

    await exportBuildToTtm(
      { jobName: JOB_NAME, buildNumber: BUILD_NUMBER, branchName: 'main', projectId: PROJECT_ID, buildUrl: BUILD_URL },
      jenkins2,
      tuleap2,
      TRACKER_ID,
      () => {}
    )

    const warmUpCalls2 = vi.mocked(tuleapFetch2).mock.calls.filter(([input]) => {
      const url = typeof input === 'string' ? input : input.toString()
      return url.includes(`/api/trackers/${TRACKER_ID}/artifacts`)
    })

    expect(warmUpCalls1.length).toBeGreaterThanOrEqual(1)
    expect(warmUpCalls2.length).toBe(0)
  })
})

describe('exportBuildToTtm — auto-detect tracker', () => {
  it('discovers tracker by item_name=test when ttmTrackerId is null', async () => {
    const { jenkins, tuleap } = makeClients({
      trackers: [
        { id: 5, label: 'Bugs', item_name: 'bug' },
        { id: TRACKER_ID, label: 'Test Definitions', item_name: 'test' }
      ]
    })

    const result = await exportBuildToTtm(
      { jobName: JOB_NAME, buildNumber: BUILD_NUMBER, branchName: 'main', projectId: PROJECT_ID, buildUrl: BUILD_URL },
      jenkins,
      tuleap,
      null, // ← auto-detect
      () => {}
    )

    expect(result.total).toBe(4)
    expect(result.campaignId).toBe(CAMPAIGN_ID)
  })

  it('throws when no TTM tracker is found', async () => {
    const { jenkins, tuleap } = makeClients({
      trackers: [
        { id: 5, label: 'Bugs', item_name: 'bug' },
        { id: 6, label: 'Features', item_name: 'feature' }
      ]
    })

    await expect(
      exportBuildToTtm(
        { jobName: JOB_NAME, buildNumber: BUILD_NUMBER, branchName: 'main', projectId: PROJECT_ID, buildUrl: BUILD_URL },
        jenkins,
        tuleap,
        null,
        () => {}
      )
    ).rejects.toThrow(/détecter automatiquement/)
  })
})

describe('exportBuildToTtm — error cases', () => {
  it('throws when build has no test report (Jenkins 404)', async () => {
    const jenkinsFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/testReport/api/json')) return new Response('Not Found', { status: 404 })
      throw new Error(`Unmocked: ${url}`)
    }) as typeof globalThis.fetch

    const jenkins = new JenkinsClient({ baseUrl: JENKINS_BASE, username: 'u', apiToken: 't', fetchImpl: jenkinsFetch })
    const tuleap = new TuleapClient({ baseUrl: TULEAP_BASE, token: 'tlp', fetchImpl: makeTuleapFetch({}) })

    await expect(
      exportBuildToTtm(
        { jobName: JOB_NAME, buildNumber: 404, branchName: 'main', projectId: PROJECT_ID, buildUrl: BUILD_URL },
        jenkins,
        tuleap,
        TRACKER_ID,
        () => {}
      )
    ).rejects.toThrow(/rapport de test JUnit/)
  })

  it('throws when TTM tracker has no title semantic', async () => {
    const { jenkins, tuleap } = makeClients({ noTitleSemantic: true })

    await expect(
      exportBuildToTtm(
        { jobName: JOB_NAME, buildNumber: BUILD_NUMBER, branchName: 'main', projectId: PROJECT_ID, buildUrl: BUILD_URL },
        jenkins,
        tuleap,
        TRACKER_ID,
        () => {}
      )
    ).rejects.toThrow(/champ titre/)
  })

  it('throws when test report has zero cases', async () => {
    const jenkinsFetch = vi.fn(async () =>
      jsonRes({ duration: 0, failCount: 0, passCount: 0, skipCount: 0, suites: [] })
    ) as typeof globalThis.fetch
    const jenkins = new JenkinsClient({ baseUrl: JENKINS_BASE, username: 'u', apiToken: 't', fetchImpl: jenkinsFetch })
    const tuleap = new TuleapClient({ baseUrl: TULEAP_BASE, token: 'tlp', fetchImpl: makeTuleapFetch({}) })

    await expect(
      exportBuildToTtm(
        { jobName: JOB_NAME, buildNumber: BUILD_NUMBER, branchName: 'main', projectId: PROJECT_ID, buildUrl: BUILD_URL },
        jenkins,
        tuleap,
        TRACKER_ID,
        () => {}
      )
    ).rejects.toThrow(/Aucun cas de test/)
  })

  it('propagates Tuleap auth errors from campaign creation', async () => {
    const tuleapFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'GET' && url.includes('/api/trackers')) {
        return jsonRes(TRACKER_STRUCTURE_RESPONSE)
      }
      if (method === 'POST' && url.includes('/testmanagement_campaigns')) {
        return new Response('Forbidden', { status: 403 })
      }
      // cache warm-up
      if (method === 'GET') {
        return paginatedRes([], 0)
      }
      throw new Error(`Unmocked: ${method} ${url}`)
    }) as typeof globalThis.fetch

    const jenkins = new JenkinsClient({ baseUrl: JENKINS_BASE, username: 'u', apiToken: 't', fetchImpl: makeJenkinsFetch() })
    const tuleap = new TuleapClient({ baseUrl: TULEAP_BASE, token: 'tlp', fetchImpl: tuleapFetch })

    await expect(
      exportBuildToTtm(
        { jobName: JOB_NAME, buildNumber: BUILD_NUMBER, branchName: 'main', projectId: PROJECT_ID, buildUrl: BUILD_URL },
        jenkins,
        tuleap,
        TRACKER_ID,
        () => {}
      )
    ).rejects.toThrow()
  })
})

describe('exportBuildToTtm — campaign label', () => {
  it('includes jobName, branchName and buildNumber in campaign label', async () => {
    const tuleapFetch = makeTuleapFetch({})
    const tuleap = new TuleapClient({ baseUrl: TULEAP_BASE, token: 'tlp', fetchImpl: tuleapFetch })
    const jenkins = new JenkinsClient({ baseUrl: JENKINS_BASE, username: 'u', apiToken: 't', fetchImpl: makeJenkinsFetch() })

    await exportBuildToTtm(
      { jobName: 'mon-api', buildNumber: 87, branchName: 'feature/my-branch', projectId: PROJECT_ID, buildUrl: BUILD_URL },
      jenkins,
      tuleap,
      TRACKER_ID,
      () => {}
    )

    const calls = vi.mocked(tuleapFetch).mock.calls
    const campaignCall = calls.find(([input, init]) => {
      const url = typeof input === 'string' ? input : input.toString()
      return (init?.method ?? 'GET').toUpperCase() === 'POST' && url.includes('/testmanagement_campaigns')
    })

    expect(campaignCall).toBeDefined()
    const body = JSON.parse(campaignCall![1]?.body as string)
    expect(body.label).toContain('mon-api')
    expect(body.label).toContain('feature/my-branch')
    expect(body.label).toContain('87')
    expect(body.project_id).toBe(PROJECT_ID)
  })
})
