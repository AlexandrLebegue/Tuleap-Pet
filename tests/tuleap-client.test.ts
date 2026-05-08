import { describe, expect, it, vi } from 'vitest'
import {
  TuleapAuthError,
  TuleapClient,
  TuleapNetworkError,
  TuleapNotFoundError,
  TuleapSchemaError,
  TuleapServerError
} from '../src/main/tuleap'

const BASE_URL = 'https://tuleap.example.com'
const TOKEN = 'tlp.k1.fake'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
}

function paginatedResponse(body: unknown, total: number): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-PAGINATION-SIZE': String(total),
      'X-PAGINATION-LIMIT': '50',
      'X-PAGINATION-OFFSET': '0'
    }
  })
}

function makeClient(fetchImpl: typeof globalThis.fetch): TuleapClient {
  return new TuleapClient({ baseUrl: BASE_URL, token: TOKEN, fetchImpl })
}

describe('TuleapClient.getSelf', () => {
  it('parses a 200 response and forwards X-Auth-AccessKey + Accept headers', async () => {
    const fetchImpl = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      expect(url).toBe(`${BASE_URL}/api/users/self`)
      const headers = init?.headers as Record<string, string>
      expect(headers['X-Auth-AccessKey']).toBe(TOKEN)
      expect(headers['Accept']).toBe('application/json')
      return jsonResponse({ id: 42, uri: 'users/42', username: 'alice', real_name: 'Alice Doe' })
    })
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    const me = await client.getSelf()
    expect(me).toMatchObject({ id: 42, username: 'alice', real_name: 'Alice Doe' })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('throws TuleapAuthError on HTTP 401', async () => {
    const fetchImpl = vi.fn(async () => new Response('forbidden', { status: 401 }))
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    await expect(client.getSelf()).rejects.toBeInstanceOf(TuleapAuthError)
  })

  it('throws TuleapAuthError on HTTP 403', async () => {
    const fetchImpl = vi.fn(async () => new Response('forbidden', { status: 403 }))
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    await expect(client.getSelf()).rejects.toBeInstanceOf(TuleapAuthError)
  })

  it('throws TuleapServerError on HTTP 500', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }))
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    const promise = client.getSelf()
    await expect(promise).rejects.toBeInstanceOf(TuleapServerError)
    await expect(promise).rejects.toMatchObject({ status: 500 })
  })

  it('throws TuleapNetworkError when fetch throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('failed to fetch')
    })
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    await expect(client.getSelf()).rejects.toBeInstanceOf(TuleapNetworkError)
  })

  it('throws TuleapSchemaError when the body is missing required fields', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ uri: 'users/42' }))
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    await expect(client.getSelf()).rejects.toBeInstanceOf(TuleapSchemaError)
  })

  it('throws TuleapSchemaError when the body is not JSON', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('<html>oops</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        })
    )
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    await expect(client.getSelf()).rejects.toBeInstanceOf(TuleapSchemaError)
  })
})

describe('TuleapClient.listProjects', () => {
  it('returns parsed items and total from X-PAGINATION-SIZE', async () => {
    const fetchImpl = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.toString()
      expect(url).toMatch(/\/api\/projects\?/)
      expect(url).toContain('limit=50')
      expect(url).toContain('offset=0')
      return paginatedResponse(
        [
          { id: 1, uri: 'projects/1', label: 'Alpha', shortname: 'alpha' },
          { id: 2, uri: 'projects/2', label: 'Beta', shortname: 'beta' }
        ],
        17
      )
    })
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    const page = await client.listProjects()
    expect(page.items).toHaveLength(2)
    expect(page.items[0]?.shortname).toBe('alpha')
    expect(page.total).toBe(17)
    expect(page.limit).toBe(50)
    expect(page.offset).toBe(0)
  })

  it('forwards a query parameter when provided', async () => {
    const fetchImpl = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.toString()
      expect(url).toContain('query=')
      return paginatedResponse([], 0)
    })
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    await client.listProjects({ query: 'foo' })
    expect(fetchImpl).toHaveBeenCalled()
  })
})

describe('TuleapClient.getArtifact', () => {
  it('throws TuleapNotFoundError on HTTP 404', async () => {
    const fetchImpl = vi.fn(async () => new Response('not found', { status: 404 }))
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    await expect(client.getArtifact(999)).rejects.toBeInstanceOf(TuleapNotFoundError)
  })

  it('parses a complete artifact with values', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        id: 1234,
        uri: 'artifacts/1234',
        title: 'My Story',
        status: 'Open',
        tracker: { id: 1 },
        values: [
          { field_id: 1, type: 'string', label: 'Title', value: 'My Story' },
          { field_id: 2, type: 'art_link', label: 'Links', links: [{ id: 1235, uri: 'artifacts/1235' }] }
        ]
      })
    )
    const client = makeClient(fetchImpl as unknown as typeof fetch)
    const artifact = await client.getArtifact(1234)
    expect(artifact.id).toBe(1234)
    expect(artifact.values).toHaveLength(2)
  })
})
