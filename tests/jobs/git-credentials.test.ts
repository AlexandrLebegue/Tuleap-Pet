import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/tuleap/build', () => ({
  buildTuleapClient: vi.fn(async () => ({
    getSelf: async () => ({ id: 101, username: 'alice', real_name: 'Alice' })
  }))
}))

vi.mock('../../src/main/store/config', () => ({
  getConfig: () => ({ authMode: 'token' })
}))

vi.mock('../../src/main/store/secrets', () => ({
  getTuleapToken: () => 'tlp-k1-1.deadbeef',
  getOAuthBundle: () => null
}))

vi.mock('../../src/main/logger', () => ({
  debugError: vi.fn()
}))

import {
  injectGitCredentials,
  explainGitAuthFailure,
  _resetGitCredentialsCacheForTests
} from '../../src/main/jobs/git-credentials'

describe('injectGitCredentials', () => {
  beforeEach(() => {
    _resetGitCredentialsCacheForTests()
  })

  it("utilise le vrai login Tuleap (pas 'x') et le token comme password", async () => {
    const url = await injectGitCredentials(
      'https://tuleap.local/plugins/git/proj/repo.git'
    )
    expect(url).toBe(
      'https://alice:tlp-k1-1.deadbeef@tuleap.local/plugins/git/proj/repo.git'
    )
  })

  it("renvoie l'URL telle quelle pour SSH (pas d'injection HTTP)", async () => {
    const ssh = 'ssh://gitolite@tuleap.local/proj/repo.git'
    expect(await injectGitCredentials(ssh)).toBe(ssh)
  })

  it("renvoie l'URL inchangée quand resolveUsername échoue", async () => {
    const mod = await import('../../src/main/tuleap/build')
    const spy = mod.buildTuleapClient as unknown as ReturnType<typeof vi.fn>
    spy.mockRejectedValueOnce(new Error('offline'))
    _resetGitCredentialsCacheForTests()
    const url = await injectGitCredentials('https://tuleap.local/x.git')
    expect(url).toBe('https://tuleap.local/x.git')
  })
})

describe('explainGitAuthFailure', () => {
  it("transforme 'Authentication failed' en hint clair sur le scope `write:git_repository`", () => {
    const raw = "fatal: Authentication failed for 'https://tuleap.local/...'"
    const hint = explainGitAuthFailure(raw)
    expect(hint).toMatch(/write:git_repository/)
    expect(hint).toMatch(/git clone failed|Authentication failed/i)
  })

  it("ignore les erreurs non-auth (réseau, branche introuvable, etc.)", () => {
    expect(explainGitAuthFailure('Connection refused')).toBeNull()
    expect(
      explainGitAuthFailure("Remote branch foo not found in upstream origin")
    ).toBeNull()
  })
})
