import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseSvnList, parseSvnLog, parseSvnInfo } from '../../src/main/svn/svn-xml'

/**
 * End-to-end functional test that drives the **real** `svn` binary and feeds its
 * `--xml` output into the parsers — the same path the app exercises at runtime.
 * Skips automatically when `svn` isn't installed (e.g. on a CI runner without
 * Subversion), so it never makes the suite red elsewhere.
 */
function svnAvailable(): boolean {
  try {
    execFileSync('svn', ['--version', '--quiet'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const HAS_SVN = svnAvailable()
const d = HAS_SVN ? describe : describe.skip

d('svn functional (real binary)', () => {
  let work: string
  let repoUrl: string
  const svn = (args: string[], cwd?: string): string =>
    execFileSync('svn', args, { cwd, encoding: 'utf8' })

  beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), 'svnfunc-'))
    execFileSync('svnadmin', ['create', join(work, 'repo')])
    repoUrl = `file://${join(work, 'repo')}`
    svn(['mkdir', '-q', `${repoUrl}/trunk`, `${repoUrl}/branches`, `${repoUrl}/tags`, '-m', 'init'])
    svn(['-q', 'checkout', `${repoUrl}/trunk`, join(work, 'wc')])
    writeFileSync(
      join(work, 'wc', 'foo.h'),
      '#ifndef FOO_H\n#define FOO_H\nint add(int a, int b);\n#endif\n'
    )
    writeFileSync(
      join(work, 'wc', 'foo.c'),
      '#include "foo.h"\nint add(int a,int b){return a+b;}\n'
    )
    svn(['-q', 'add', 'foo.h', 'foo.c'], join(work, 'wc'))
    svn(['-q', 'commit', '-m', 'add foo'], join(work, 'wc'))
    writeFileSync(
      join(work, 'wc', 'foo.c'),
      '#include "foo.h"\nint add(int a,int b){return a+b;}\n// edit\n'
    )
    svn(['-q', 'commit', '-m', 'touch foo refs #42'], join(work, 'wc'))
  })

  afterAll(() => {
    try {
      rmSync(work, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  })

  it('parses `svn list --xml` of the repo root (standard layout)', () => {
    const entries = parseSvnList(svn(['list', '--xml', repoUrl]))
    expect(entries.map((e) => e.name).sort()).toEqual(['branches', 'tags', 'trunk'])
    expect(entries.every((e) => e.kind === 'dir')).toBe(true)
    expect(entries.find((e) => e.name === 'trunk')!.revision).toBeGreaterThanOrEqual(1)
  })

  it('parses `svn log --xml` of trunk', () => {
    const commits = parseSvnLog(svn(['log', '--xml', '--limit', '5', `${repoUrl}/trunk`]))
    expect(commits.length).toBeGreaterThanOrEqual(2)
    expect(commits[0]!.shortId).toMatch(/^r\d+$/)
    expect(commits[0]!.title).toBe('touch foo refs #42')
    expect(commits[0]!.authorName.length).toBeGreaterThan(0)
  })

  it('parses `svn info --xml` of trunk', () => {
    const info = parseSvnInfo(svn(['info', '--xml', `${repoUrl}/trunk`]))
    expect(info).not.toBeNull()
    expect(info!.relativeUrl).toBe('^/trunk')
    expect(info!.repositoryRoot).toBe(repoUrl)
    expect(typeof info!.revision).toBe('number')
  })

  it('produces and re-applies a patch (the generate-patch workflow)', () => {
    const patchWc = join(work, 'patchwc')
    svn(['-q', 'checkout', `${repoUrl}/trunk`, patchWc])
    const h = readFileSync(join(patchWc, 'foo.h'), 'utf8').replace(
      'int add(int a, int b);',
      '/** Adds two integers. */\nint add(int a, int b);'
    )
    writeFileSync(join(patchWc, 'foo.h'), h)

    const patch = svn(['diff', '--internal-diff', '.'], patchWc)
    expect(patch).toContain('Index: foo.h')
    expect(patch).toContain('+/** Adds two integers. */')

    // The patch round-trips: revert then `svn patch` re-applies cleanly.
    writeFileSync(join(work, 'gen.patch'), patch)
    svn(['revert', '-R', '.'], patchWc)
    const applied = svn(['patch', join(work, 'gen.patch')], patchWc)
    expect(applied).toMatch(/foo\.h/)
    expect(readFileSync(join(patchWc, 'foo.h'), 'utf8')).toContain('/** Adds two integers. */')
  })
})
