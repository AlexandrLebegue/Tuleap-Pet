import { describe, expect, it, vi } from 'vitest'
import { JenkinsClient } from '../src/main/jenkins/client'
import {
  JenkinsAuthError,
  JenkinsNetworkError,
  JenkinsNotFoundError,
  JenkinsSchemaError,
  JenkinsServerError
} from '../src/main/jenkins/errors'

const BASE_URL = 'https://jenkins.example.com'
const USERNAME = 'john'
const API_TOKEN = 'abc123token'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
}

function textResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain' }, ...init })
}

function makeClient(fetchImpl: typeof globalThis.fetch): JenkinsClient {
  return new JenkinsClient({ baseUrl: BASE_URL, username: USERNAME, apiToken: API_TOKEN, fetchImpl })
}

describe('JenkinsClient token classification', () => {
  const noFetch = (async () => textResponse('')) as unknown as typeof fetch

  it('detects a Jenkins API token (11 + 32 hex)', () => {
    const client = new JenkinsClient({
      baseUrl: BASE_URL,
      username: USERNAME,
      apiToken: '11201c7e9f6953d11e7114d0cf119459b2',
      fetchImpl: noFetch
    })
    expect(client.tokenKind).toBe('jenkins-api-token')
  })

  it('detects a Tuleap access key (tlp.k1.…)', () => {
    const client = new JenkinsClient({
      baseUrl: BASE_URL,
      username: USERNAME,
      apiToken: 'tlp.k1.13.aabbccddeeff00112233445566778899',
      fetchImpl: noFetch
    })
    expect(client.tokenKind).toBe('tuleap-access-key')
  })

  it('classifies anything else as unknown', () => {
    expect(makeClient(noFetch).tokenKind).toBe('unknown')
  })
})

describe('JenkinsClient auth header', () => {
  it('sends Basic Authorization header', async () => {
    const expected = `Basic ${Buffer.from(`${USERNAME}:${API_TOKEN}`).toString('base64')}`
    const fetchImpl = vi.fn(async (_input, init) => {
      const headers = init?.headers as Record<string, string>
      expect(headers['Authorization']).toBe(expected)
      return jsonResponse({ nodeName: 'master', version: '2.400', name: 'frsp660', authenticated: true, anonymous: false, authorities: ['authenticated'] })
    })
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    await client.testConnection()
    // testConnection makes 2 requests: /api/json + /whoAmI/api/json
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('JenkinsClient.testConnection', () => {
  it('returns version, nodeName, whoAmI info', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('whoAmI')) {
        return jsonResponse({ name: 'frsp660', authenticated: true, anonymous: false, authorities: ['authenticated', 'grp-jenkins'] })
      }
      return jsonResponse({ nodeName: 'built-in', version: '2.400.1', _class: 'hudson.model.Hudson' })
    })
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    const result = await client.testConnection()
    expect(result).toMatchObject({ nodeName: 'built-in', version: '2.400.1', whoAmIName: 'frsp660', missingGroups: false })
  })

  it('throws JenkinsAuthError on 401', async () => {
    const fetchImpl = vi.fn(async () => new Response('Unauthorized', { status: 401 }))
    await expect(makeClient(fetchImpl as unknown as typeof fetch).testConnection()).rejects.toBeInstanceOf(JenkinsAuthError)
  })

  it('throws JenkinsAuthError on 403', async () => {
    const fetchImpl = vi.fn(async () => new Response('Forbidden', { status: 403 }))
    await expect(makeClient(fetchImpl as unknown as typeof fetch).testConnection()).rejects.toBeInstanceOf(JenkinsAuthError)
  })

  it('throws JenkinsServerError on 500', async () => {
    const fetchImpl = vi.fn(async () => new Response('Internal error', { status: 500 }))
    await expect(makeClient(fetchImpl as unknown as typeof fetch).testConnection()).rejects.toBeInstanceOf(JenkinsServerError)
  })

  it('throws JenkinsNetworkError on fetch failure', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    await expect(makeClient(fetchImpl as unknown as typeof fetch).testConnection()).rejects.toBeInstanceOf(JenkinsNetworkError)
  })

  it('throws JenkinsSchemaError on non-JSON response', async () => {
    const fetchImpl = vi.fn(async () => new Response('not json {{{', { status: 200 }))
    await expect(makeClient(fetchImpl as unknown as typeof fetch).testConnection()).rejects.toBeInstanceOf(JenkinsSchemaError)
  })
})

describe('JenkinsClient.listJobs', () => {
  it('includes tree param in request URL', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString())
      expect(url.searchParams.get('tree')).not.toBeNull()
      return jsonResponse({
        jobs: [
          { name: 'my-app', displayName: 'My App', url: `${BASE_URL}/job/my-app/`, color: 'blue', _class: 'org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject' }
        ]
      })
    })
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    const jobs = await client.listJobs()
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.name).toBe('my-app')
    expect(jobs[0]!.isFolder).toBe(true)
  })

  it('marks folder jobs correctly', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        jobs: [
          { name: 'freestyle', _class: 'hudson.model.FreeStyleProject', color: 'blue', url: `${BASE_URL}/job/freestyle/` },
          { name: 'folder', _class: 'com.cloudbees.hudson.plugins.folder.Folder', color: 'blue', url: `${BASE_URL}/job/folder/` }
        ]
      })
    )
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    const jobs = await client.listJobs()
    expect(jobs.find((j) => j.name === 'freestyle')?.isFolder).toBe(false)
    expect(jobs.find((j) => j.name === 'folder')?.isFolder).toBe(true)
  })
})

describe('JenkinsClient.getBranchStatus', () => {
  it('returns null on 404 (no build for that branch)', async () => {
    const fetchImpl = vi.fn(async () => new Response('Not Found', { status: 404 }))
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    const result = await client.getBranchStatus('my-app', 'feature/test')
    expect(result).toBeNull()
  })

  it('encodes slash in branch name', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      expect(url).toContain('%2F')
      return jsonResponse({ number: 42, result: 'SUCCESS', timestamp: Date.now(), building: false, url: `${BASE_URL}/job/my-app/job/feature%2Ftest/42/` })
    })
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    await client.getBranchStatus('my-app', 'feature/test')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('maps result to JenkinsBranchStatus', async () => {
    const ts = Date.now()
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ number: 10, result: 'FAILURE', timestamp: ts, building: false, url: `${BASE_URL}/job/app/job/main/10/` })
    )
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    const status = await client.getBranchStatus('app', 'main')
    expect(status).not.toBeNull()
    expect(status!.result).toBe('FAILURE')
    expect(status!.buildNumber).toBe(10)
  })
})

describe('JenkinsClient.getBuildHistory', () => {
  it('uses tree range slice in query', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString())
      const tree = url.searchParams.get('tree') ?? ''
      expect(tree).toContain('{0,')
      return jsonResponse({ builds: [] })
    })
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    await client.getBuildHistory('my-app', 10)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})

describe('JenkinsClient.getQueue', () => {
  it('returns empty array for empty queue', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ items: [] }))
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    const queue = await client.getQueue()
    expect(queue).toEqual([])
  })

  it('maps queue items', async () => {
    const ts = Date.now()
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        items: [
          {
            id: 1,
            why: 'Waiting for executor',
            inQueueSince: ts,
            task: { name: 'my-app', url: `${BASE_URL}/job/my-app/` },
            blocked: false,
            buildable: true,
            stuck: false
          }
        ]
      })
    )
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    const queue = await client.getQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0]!.jobName).toBe('my-app')
    expect(queue[0]!.buildable).toBe(true)
  })
})

describe('JenkinsClient.getConsoleText', () => {
  it('returns plain text console output', async () => {
    const fetchImpl = vi.fn(async () => textResponse('Started by user\nBuilding...\nFinished: SUCCESS'))
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    const text = await client.getConsoleText('my-app', 42)
    expect(text).toContain('Finished: SUCCESS')
  })

  it('throws JenkinsNotFoundError when build does not exist', async () => {
    const fetchImpl = vi.fn(async () => new Response('Not Found', { status: 404 }))
    await expect(
      makeClient(fetchImpl as unknown as typeof fetch).getConsoleText('my-app', 9999)
    ).rejects.toBeInstanceOf(JenkinsNotFoundError)
  })
})
