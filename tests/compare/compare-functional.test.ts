import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseUnifiedDiffStats } from '../../src/main/compare/diff-utils'
import { streamDiff } from '../../src/main/compare/diff-stream'
import { parseSvnLog } from '../../src/main/svn/svn-xml'

/**
 * Functional checks that drive the **real** git/svn binaries with the exact
 * commands the compare backends run (three-dot git diff / `svn diff URL URL` /
 * `svn log --stop-on-copy`) and feed the output through the shared parsers.
 * Each block skips automatically when its binary is missing.
 */
function has(bin: string, args: string[]): boolean {
  try {
    execFileSync(bin, args, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const dGit = has('git', ['--version']) ? describe : describe.skip
const dSvn = has('svn', ['--version', '--quiet']) ? describe : describe.skip

dGit('git compare (real binary)', () => {
  let work: string
  const git = (args: string[], cwd: string): string =>
    execFileSync('git', args, { cwd, encoding: 'utf8' })

  beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), 'gitcmp-'))
    git(['init', '-q', '-b', 'main'], work)
    git(['config', 'user.email', 't@t.dev'], work)
    git(['config', 'user.name', 'T'], work)
    writeFileSync(join(work, 'foo.c'), 'int add(int a,int b){return a+b;}\n')
    git(['add', '.'], work)
    git(['commit', '-q', '-m', 'base: add'], work)
    git(['checkout', '-q', '-b', 'feature'], work)
    writeFileSync(
      join(work, 'foo.c'),
      'int add(int a,int b){return a+b;}\nint sub(int a,int b){return a-b;}\n'
    )
    writeFileSync(join(work, 'bar.c'), 'int mul(int a,int b){return a*b;}\n')
    git(['add', '.'], work)
    git(['commit', '-q', '-m', 'feat: sub + mul'], work)
  })

  afterAll(() => rmSync(work, { recursive: true, force: true }))

  it('three-dot diff surfaces only what feature adds, with correct stats', () => {
    const diff = git(['diff', 'main...feature'], work)
    const stats = parseUnifiedDiffStats(diff)
    expect(stats.filesChanged.sort()).toEqual(['bar.c', 'foo.c'])
    expect(stats.additions).toBe(2) // int sub + int mul
    expect(stats.deletions).toBe(0)
  })

  it('git log main..feature lists the commits unique to feature', () => {
    const log = git(['log', 'main..feature', '--pretty=format:%s'], work).trim()
    expect(log).toBe('feat: sub + mul')
  })

  it('numstat matches the textual diff stats', () => {
    const numstat = git(['diff', '--numstat', 'main...feature'], work).trim()
    const lines = numstat.split('\n').filter(Boolean)
    expect(lines.length).toBe(2) // two files changed
  })

  it('streamDiff never overflows a buffer and keeps exact stats when truncated', async () => {
    // A tiny display budget forces truncation; stats must still be exact (computed
    // over the FULL stream), which is the fix for "stdout maxBuffer length exceeded".
    const r = await streamDiff('git', ['-C', work, 'diff', 'main...feature'], 40)
    expect(r.truncated).toBe(true)
    expect(r.diff.length).toBeLessThanOrEqual(40)
    expect(r.stats.filesChanged.sort()).toEqual(['bar.c', 'foo.c'])
    expect(r.stats.additions).toBe(2)
    expect(r.stats.deletions).toBe(0)
  })

  it('streamDiff returns the full diff when under budget', async () => {
    const r = await streamDiff('git', ['-C', work, 'diff', 'main...feature'], 1_000_000)
    expect(r.truncated).toBe(false)
    expect(r.diff).toContain('int sub(int a,int b)')
    expect(r.stats.files).toBe(2)
  })

  it('streamDiff denoises: generated files excluded from the source sample', async () => {
    // Add a noisy generated file + a real source file on a new branch.
    git(['checkout', '-q', 'main'], work)
    git(['checkout', '-q', '-b', 'noisy'], work)
    // Generated MSBuild noise (like the 16M-line .vcxproj.filters case).
    writeFileSync(
      join(work, 'App.vcxproj.filters'),
      '<Project>\n' + '  <X/>\n'.repeat(500) + '</Project>\n'
    )
    writeFileSync(join(work, 'feature.c'), 'int brand_new_feature(void){ return 7; }\n')
    git(['add', '.'], work)
    git(['commit', '-q', '-m', 'feat + generated'], work)

    const r = await streamDiff('git', ['-C', work, 'diff', 'main...noisy'], {
      displayBudget: 1_000_000,
      sampleBudget: 120_000,
      perFileBudget: 4_000
    })
    // Source sample contains the real code, NOT the generated XML.
    expect(r.sourceSample).toContain('brand_new_feature')
    expect(r.sourceSample).not.toContain('<Project>')
    // Breakdown counts both files in the right buckets.
    expect(r.breakdown.source).toBe(1)
    expect(r.breakdown.generated).toBe(1)
  })
})

dSvn('svn compare (real binary)', () => {
  let work: string
  let repo: string
  const svn = (args: string[], cwd?: string): string =>
    execFileSync('svn', args, { cwd, encoding: 'utf8' })

  beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), 'svncmp-'))
    execFileSync('svnadmin', ['create', join(work, 'repo')])
    repo = `file://${join(work, 'repo')}`
    svn(['mkdir', '-q', `${repo}/trunk`, `${repo}/branches`, '-m', 'init'])
    svn(['-q', 'checkout', `${repo}/trunk`, join(work, 'wc')])
    writeFileSync(join(work, 'wc', 'foo.c'), 'int add(int a,int b){return a+b;}\n')
    svn(['-q', 'add', 'foo.c'], join(work, 'wc'))
    svn(['-q', 'commit', '-m', 'trunk: add'], join(work, 'wc'))
    // Branch via svn copy, then add a feature on the branch.
    svn(['-q', 'copy', `${repo}/trunk`, `${repo}/branches/feat`, '-m', 'create branch feat'])
    svn(['-q', 'checkout', `${repo}/branches/feat`, join(work, 'bwc')])
    writeFileSync(
      join(work, 'bwc', 'foo.c'),
      'int add(int a,int b){return a+b;}\nint sub(int a,int b){return a-b;}\n'
    )
    svn(['-q', 'commit', '-m', 'feat: sub'], join(work, 'bwc'))
  })

  afterAll(() => rmSync(work, { recursive: true, force: true }))

  it('svn diff between two URLs surfaces the branch changes', () => {
    const diff = svn(['diff', '--internal-diff', `${repo}/trunk`, `${repo}/branches/feat`])
    const stats = parseUnifiedDiffStats(diff)
    expect(stats.filesChanged).toEqual(['foo.c'])
    expect(stats.additions).toBe(1) // int sub
  })

  it('svn log --stop-on-copy lists only the branch own history', () => {
    const xml = svn(['log', '--xml', '--stop-on-copy', `${repo}/branches/feat`])
    const commits = parseSvnLog(xml)
    const titles = commits.map((c) => c.title)
    // Includes the branch creation + the feature commit, NOT the trunk-only commit.
    expect(titles).toContain('feat: sub')
    expect(titles).toContain('create branch feat')
    expect(titles).not.toContain('trunk: add')
  })
})
