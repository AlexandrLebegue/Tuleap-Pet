import { randomBytes, createHash } from 'crypto'

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function generatePkceVerifier(): string {
  // RFC 7636 §4.1 — between 43 and 128 chars; 32 random bytes → 43 base64url chars.
  return base64UrlEncode(randomBytes(32))
}

export function pkceChallengeS256(verifier: string): string {
  return base64UrlEncode(createHash('sha256').update(verifier).digest())
}

export function generateState(): string {
  return base64UrlEncode(randomBytes(16))
}
