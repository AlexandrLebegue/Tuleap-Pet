import { describe, it, expect } from 'vitest'
import { resolveSvnUrl } from '../../src/main/tuleap/svn-url'
import type { SvnRepositoryRaw } from '../../src/main/tuleap/schemas'

const base = (over: Partial<SvnRepositoryRaw>): SvnRepositoryRaw =>
  ({
    id: 1,
    name: 'repo',
    description: '',
    svn_url: '',
    http_url: '',
    url: '',
    ...over
  }) as SvnRepositoryRaw

describe('resolveSvnUrl', () => {
  it('prefers the explicit svn_url field', () => {
    const r = base({ svn_url: 'https://tuleap.example/svnplugin/proj/repo' })
    expect(resolveSvnUrl(r, 'https://tuleap.example')).toBe(
      'https://tuleap.example/svnplugin/proj/repo'
    )
  })

  it('falls back to http_url then url', () => {
    expect(resolveSvnUrl(base({ http_url: 'https://h/x' }), null)).toBe('https://h/x')
    expect(resolveSvnUrl(base({ url: 'https://u/y' }), null)).toBe('https://u/y')
  })

  it('builds the standard SVN plugin URL from instance + project shortname + repo name', () => {
    const r = base({ name: 'my repo', project: { shortname: 'my-proj' } })
    expect(resolveSvnUrl(r, 'https://tuleap.example/')).toBe(
      'https://tuleap.example/svnplugin/my-proj/my%20repo'
    )
  })

  it('uses project.label when shortname is absent', () => {
    const r = base({ name: 'repo', project: { label: 'Proj' } })
    expect(resolveSvnUrl(r, 'https://t.example')).toBe('https://t.example/svnplugin/Proj/repo')
  })

  it('returns empty string when nothing usable can be derived', () => {
    expect(resolveSvnUrl(base({}), null)).toBe('')
    expect(resolveSvnUrl(base({ project: { shortname: 'p' } }), null)).toBe('')
  })
})
