/**
 * Unit tests for the Jenkins chat tools (buildJenkinsTools).
 *
 * Each tool's execute() is called with a mock JenkinsClient injected via
 * vi.mock so no real HTTP or Electron dependencies are needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock dependencies ────────────────────────────────────────────────────────

vi.mock('../src/main/store/config', () => ({
  getJenkinsUrl: vi.fn(() => 'https://jenkins.example.com'),
  getConfig: vi.fn(() => ({}))
}))

vi.mock('../src/main/store/secrets', () => ({
  hasJenkinsToken: vi.fn(() => true)
}))

vi.mock('../src/main/store/db', () => ({
  audit: vi.fn()
}))

const mockListJobs = vi.fn()
const mockGetBuildHistory = vi.fn()
const mockGetBuildDetail = vi.fn()
const mockGetTestReport = vi.fn()
const mockGetQueue = vi.fn()

vi.mock('../src/main/jenkins', () => ({
  buildJenkinsClient: vi.fn(() => ({
    listJobs: mockListJobs,
    getBuildHistory: mockGetBuildHistory,
    getBuildDetail: mockGetBuildDetail,
    getTestReport: mockGetTestReport,
    getQueue: mockGetQueue
  })),
  JenkinsError: class JenkinsError extends Error {
    constructor(
      public kind: string,
      message: string
    ) {
      super(message)
    }
  }
}))

vi.mock('../src/main/jenkins/junit-parser', () => ({
  parseTestReport: vi.fn((raw: unknown) => {
    const r = raw as Record<string, unknown>
    return {
      totalCount: (r['passCount'] as number) + (r['failCount'] as number) + (r['skipCount'] as number),
      passCount: r['passCount'],
      failCount: r['failCount'],
      skipCount: r['skipCount'],
      cases: (r['cases'] as unknown[]) ?? []
    }
  })
}))

// Import AFTER mocks are set up
import { buildJenkinsTools } from '../src/main/llm/jenkins-tools'

// ─── Helpers ─────────────────────────────────────────────────────────────────

type AiTool = {
  description?: string
  inputSchema?: { safeParse: (v: unknown) => { success: boolean } }
  execute: (input: unknown) => Promise<unknown>
}

function getTool(name: string): AiTool {
  const tools = buildJenkinsTools()
  const t = tools[name]
  if (!t) throw new Error(`Tool "${name}" not found`)
  return t as AiTool
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buildJenkinsTools — registration', () => {
  it('returns 5 tools when Jenkins is configured', () => {
    const tools = buildJenkinsTools()
    expect(Object.keys(tools).sort()).toEqual(
      [
        'jenkins_get_build_detail',
        'jenkins_get_build_history',
        'jenkins_get_queue',
        'jenkins_get_test_report',
        'jenkins_list_jobs'
      ].sort()
    )
  })

  it('returns empty object when Jenkins URL is absent', async () => {
    const { getJenkinsUrl } = await import('../src/main/store/config')
    vi.mocked(getJenkinsUrl).mockReturnValueOnce(null as unknown as string)
    expect(buildJenkinsTools()).toEqual({})
  })

  it('returns empty object when Jenkins token is absent', async () => {
    const { hasJenkinsToken } = await import('../src/main/store/secrets')
    vi.mocked(hasJenkinsToken).mockReturnValueOnce(false)
    expect(buildJenkinsTools()).toEqual({})
  })

  it('every tool has a description and inputSchema', () => {
    const tools = buildJenkinsTools()
    for (const [name, tool] of Object.entries(tools)) {
      const t = tool as AiTool
      expect(t.description, `description on ${name}`).toBeTruthy()
      expect(t.inputSchema, `inputSchema on ${name}`).toBeDefined()
    }
  })
})

describe('jenkins_list_jobs', () => {
  it('calls listJobs without folder by default', async () => {
    mockListJobs.mockResolvedValue([
      { name: 'api', displayName: 'API Pipeline', color: 'blue', lastBuildResult: 'SUCCESS', lastBuildNumber: 10, isFolder: false }
    ])

    const result = await getTool('jenkins_list_jobs').execute({}) as unknown[]
    expect(mockListJobs).toHaveBeenCalledWith(undefined)
    expect(result).toHaveLength(1)
    expect((result[0] as Record<string, unknown>)['name']).toBe('api')
  })

  it('passes folder param when provided', async () => {
    mockListJobs.mockResolvedValue([])
    await getTool('jenkins_list_jobs').execute({ folder: 'backend' })
    expect(mockListJobs).toHaveBeenCalledWith('backend')
  })

  it('returns { error } when JenkinsError is thrown', async () => {
    mockListJobs.mockRejectedValue(new Error('Network failure'))
    const result = await getTool('jenkins_list_jobs').execute({}) as Record<string, unknown>
    expect(result['error']).toBeDefined()
  })

  it('inputSchema rejects extra required fields', () => {
    const tool = getTool('jenkins_list_jobs')
    // folder is optional — both {} and { folder: 'x' } are valid
    expect(tool.inputSchema!.safeParse({}).success).toBe(true)
    expect(tool.inputSchema!.safeParse({ folder: 'backend' }).success).toBe(true)
    expect(tool.inputSchema!.safeParse({ folder: 123 }).success).toBe(false)
  })
})

describe('jenkins_get_build_history', () => {
  it('fetches 10 builds by default', async () => {
    mockGetBuildHistory.mockResolvedValue([
      { number: 5, displayName: '#5', result: 'SUCCESS', duration: 30000, timestamp: 1700000000000, building: false }
    ])

    const result = await getTool('jenkins_get_build_history').execute({ jobName: 'api' }) as unknown[]
    expect(mockGetBuildHistory).toHaveBeenCalledWith('api', 10)
    expect((result[0] as Record<string, unknown>)['duration_s']).toBe(30)
  })

  it('respects custom limit', async () => {
    mockGetBuildHistory.mockResolvedValue([])
    await getTool('jenkins_get_build_history').execute({ jobName: 'api', limit: 5 })
    expect(mockGetBuildHistory).toHaveBeenCalledWith('api', 5)
  })

  it('inputSchema requires jobName', () => {
    const tool = getTool('jenkins_get_build_history')
    expect(tool.inputSchema!.safeParse({}).success).toBe(false)
    expect(tool.inputSchema!.safeParse({ jobName: '' }).success).toBe(false)
    expect(tool.inputSchema!.safeParse({ jobName: 'api' }).success).toBe(true)
    expect(tool.inputSchema!.safeParse({ jobName: 'api', limit: 30 }).success).toBe(false) // max 25
  })

  it('returns { error } on failure', async () => {
    mockGetBuildHistory.mockRejectedValue(new Error('timeout'))
    const result = await getTool('jenkins_get_build_history').execute({ jobName: 'api' }) as Record<string, unknown>
    expect(result['error']).toBeDefined()
  })
})

describe('jenkins_get_build_detail', () => {
  it('fetches build detail and returns key fields', async () => {
    mockGetBuildDetail.mockResolvedValue({
      number: 42,
      displayName: '#42',
      result: 'FAILURE',
      building: false,
      duration: 90000,
      timestamp: 1700000000000,
      description: 'deploy to prod',
      url: 'https://jenkins.example.com/job/api/42/',
      parameters: [{ name: 'ENV', value: 'production' }],
      testReport: { total: 10, failed: 2 }
    })

    const result = await getTool('jenkins_get_build_detail').execute({ jobName: 'api', buildNumber: 42 }) as Record<string, unknown>
    expect(result['number']).toBe(42)
    expect(result['result']).toBe('FAILURE')
    expect(result['duration_s']).toBe(90)
    expect(result['parameters']).toEqual([{ name: 'ENV', value: 'production' }])
  })

  it('inputSchema requires both jobName and buildNumber', () => {
    const tool = getTool('jenkins_get_build_detail')
    expect(tool.inputSchema!.safeParse({ jobName: 'api' }).success).toBe(false)
    expect(tool.inputSchema!.safeParse({ buildNumber: 42 }).success).toBe(false)
    expect(tool.inputSchema!.safeParse({ jobName: 'api', buildNumber: 42 }).success).toBe(true)
    expect(tool.inputSchema!.safeParse({ jobName: 'api', buildNumber: 0 }).success).toBe(false)
  })
})

describe('jenkins_get_test_report', () => {
  it('returns summary with failedCases capped at 20', async () => {
    const manyCases = Array.from({ length: 30 }, (_, i) => ({
      fullName: `com.example.Test::test${i}`,
      status: 'failed',
      errorDetails: `Error ${i}`
    }))

    mockGetTestReport.mockResolvedValue({
      duration: 0, failCount: 30, passCount: 0, skipCount: 0, suites: [], cases: manyCases
    })

    // Override parseTestReport mock to return our cases
    const { parseTestReport } = await import('../src/main/jenkins/junit-parser')
    vi.mocked(parseTestReport).mockReturnValueOnce({
      totalCount: 30,
      failCount: 30,
      passCount: 0,
      skipCount: 0,
      cases: manyCases
    })

    const result = await getTool('jenkins_get_test_report').execute({ jobName: 'api', buildNumber: 5 }) as Record<string, unknown>
    expect(result['total']).toBe(30)
    expect((result['failedCases'] as unknown[]).length).toBe(20)
  })

  it('returns only failed cases in failedCases', async () => {
    const { parseTestReport } = await import('../src/main/jenkins/junit-parser')
    vi.mocked(parseTestReport).mockReturnValueOnce({
      totalCount: 3,
      failCount: 1,
      passCount: 1,
      skipCount: 1,
      cases: [
        { fullName: 'Foo::pass', status: 'passed', errorDetails: null, className: 'Foo', testName: 'pass', duration: 0, errorStackTrace: null },
        { fullName: 'Foo::fail', status: 'failed', errorDetails: 'boom', className: 'Foo', testName: 'fail', duration: 0, errorStackTrace: null },
        { fullName: 'Foo::skip', status: 'blocked', errorDetails: null, className: 'Foo', testName: 'skip', duration: 0, errorStackTrace: null }
      ]
    })

    mockGetTestReport.mockResolvedValue({})

    const result = await getTool('jenkins_get_test_report').execute({ jobName: 'api', buildNumber: 1 }) as Record<string, unknown>
    expect(result['failed']).toBe(1)
    expect((result['failedCases'] as unknown[]).length).toBe(1)
    expect((result['failedCases'] as Array<{ name: string; errorDetails: string | null }>)[0].errorDetails).toBe('boom')
  })
})

describe('jenkins_get_queue', () => {
  it('returns queue items with expected shape', async () => {
    mockGetQueue.mockResolvedValue([
      { id: 1, jobName: 'api', why: 'Waiting for executor', blocked: false, buildable: true }
    ])

    const result = await getTool('jenkins_get_queue').execute({}) as unknown[]
    expect(result).toHaveLength(1)
    const item = result[0] as Record<string, unknown>
    expect(item['id']).toBe(1)
    expect(item['jobName']).toBe('api')
    expect(item['why']).toBe('Waiting for executor')
  })

  it('returns empty array when queue is empty', async () => {
    mockGetQueue.mockResolvedValue([])
    const result = await getTool('jenkins_get_queue').execute({}) as unknown[]
    expect(result).toHaveLength(0)
  })

  it('returns { error } on failure', async () => {
    mockGetQueue.mockRejectedValue(new Error('conn refused'))
    const result = await getTool('jenkins_get_queue').execute({}) as Record<string, unknown>
    expect(result['error']).toBeDefined()
  })
})
