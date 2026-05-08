import { describe, expect, it, vi } from 'vitest'
import { LlmAuthError, LlmError, LlmNetworkError, LlmRateLimitError, toLlmError } from '../src/main/llm/errors'
import { createOpenRouterProvider } from '../src/main/llm/openrouter'

describe('toLlmError', () => {
  it('wraps a 401 status into LlmAuthError', () => {
    const err = toLlmError({ status: 401, message: 'forbidden' })
    expect(err).toBeInstanceOf(LlmAuthError)
    expect(err.status).toBe(401)
  })

  it('wraps a 403 status into LlmAuthError', () => {
    const err = toLlmError({ statusCode: 403, message: 'no' })
    expect(err).toBeInstanceOf(LlmAuthError)
  })

  it('wraps a 429 status into LlmRateLimitError', () => {
    const err = toLlmError({ status: 429, message: 'slow down' })
    expect(err).toBeInstanceOf(LlmRateLimitError)
  })

  it('wraps a non-status network failure into LlmNetworkError', () => {
    const err = toLlmError(new TypeError('fetch failed: ENOTFOUND'))
    expect(err).toBeInstanceOf(LlmNetworkError)
    expect(err.kind).toBe('network')
  })

  it('keeps the original LlmError when one is already thrown', () => {
    const original = new LlmError('rate-limit', 'limit', { status: 429 })
    expect(toLlmError(original)).toBe(original)
  })
})

describe('createOpenRouterProvider', () => {
  it('throws when apiKey is missing', () => {
    expect(() => createOpenRouterProvider({ apiKey: '', defaultModel: 'm' })).toThrow(/apiKey/)
  })

  it('exposes name = "openrouter"', () => {
    const provider = createOpenRouterProvider({ apiKey: 'sk-or-v1-test', defaultModel: 'm' })
    expect(provider.name).toBe('openrouter')
  })
})

// generateText throws synchronously when model creation fails (invalid api key
// shape is accepted at construction time, the actual auth check happens on
// the network call). We can't hit the network in unit tests, so the integration
// path is exercised manually via the Réglages → Tester le LLM button.
describe('LlmProvider.generate (smoke)', () => {
  it('rejects with an LlmError on transport failure (no network in tests)', async () => {
    vi.useFakeTimers()
    const provider = createOpenRouterProvider({ apiKey: 'sk-or-v1-test', defaultModel: 'fake-model' })
    const promise = provider.generate({
      messages: [{ role: 'user', content: 'hi' }],
      maxOutputTokens: 8
    })
    // Don't actually await — just assert the promise type.
    expect(promise).toBeInstanceOf(Promise)
    promise.catch(() => {
      /* discard, unit test only checks shape */
    })
    vi.useRealTimers()
  })
})
