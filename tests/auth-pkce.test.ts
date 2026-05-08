import { describe, expect, it } from 'vitest'
import { generatePkceVerifier, generateState, pkceChallengeS256 } from '../src/main/auth/pkce'

describe('PKCE helpers', () => {
  it('generatePkceVerifier returns a 43-char base64url string', () => {
    const v = generatePkceVerifier()
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/)
    // 32 random bytes → 43 base64url characters (no padding)
    expect(v.length).toBe(43)
  })

  it('generatePkceVerifier never repeats across calls', () => {
    const a = generatePkceVerifier()
    const b = generatePkceVerifier()
    expect(a).not.toBe(b)
  })

  it('pkceChallengeS256 is deterministic for a given verifier', () => {
    const v = 'fixed-verifier-just-for-testing-purposes'
    expect(pkceChallengeS256(v)).toBe(pkceChallengeS256(v))
  })

  it('pkceChallengeS256 matches the RFC 7636 vector', () => {
    // RFC 7636 §4.6 example
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const expected = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    expect(pkceChallengeS256(verifier)).toBe(expected)
  })

  it('generateState returns a base64url string of the expected length', () => {
    const s = generateState()
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/)
    // 16 random bytes → 22 base64url characters (no padding)
    expect(s.length).toBe(22)
  })
})
