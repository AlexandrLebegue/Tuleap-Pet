import { execSvn, parseSvnLog, svnList } from '../svn/svn-utils'
import { buildSvnAuthArgs } from '../svn/svn-credentials'
import { parseUnifiedDiffStats, truncateDiff } from './diff-utils'
import { summarizeBranchDiff } from './feature-summary'
import type { BranchCompareResult, BranchCompareCommit } from '@shared/types'

const DISPLAY_DIFF_BUDGET = 200_000

export type SvnBranchPath = { label: string; url: string }

/**
 * Enumerate the branch-like paths of an SVN repo: `trunk` plus every immediate
 * child of `branches/` and `tags/` (the standard layout). Used to populate the
 * compare picker.
 */
export async function listSvnBranchPaths(repoUrl: string): Promise<SvnBranchPath[]> {
  const base = repoUrl.replace(/\/+$/, '')
  const authArgs = await buildSvnAuthArgs(base)
  const out: SvnBranchPath[] = []

  const top = await svnList(base, authArgs).catch(() => [])
  const names = new Set(top.filter((e) => e.kind === 'dir').map((e) => e.name))

  if (names.has('trunk')) out.push({ label: 'trunk', url: `${base}/trunk` })

  for (const container of ['branches', 'tags']) {
    if (!names.has(container)) continue
    const children = await svnList(`${base}/${container}`, authArgs).catch(() => [])
    for (const c of children) {
      if (c.kind === 'dir')
        out.push({ label: `${container}/${c.name}`, url: `${base}/${container}/${c.name}` })
    }
  }

  // Fallback: if no standard layout, offer the top-level dirs directly.
  if (out.length === 0) {
    for (const e of top) {
      if (e.kind === 'dir') out.push({ label: e.name, url: `${base}/${e.name}` })
    }
  }
  return out
}

/**
 * Compare two SVN paths (server-side, no checkout): `svn diff BASE COMPARE`, the
 * compare branch's own history (`svn log --stop-on-copy`), and an AI summary.
 */
export async function compareSvnPaths(args: {
  baseUrl: string
  compareUrl: string
  baseLabel: string
  compareLabel: string
}): Promise<BranchCompareResult> {
  const { baseUrl, compareUrl, baseLabel, compareLabel } = args
  if (baseUrl === compareUrl) throw new Error('Choisissez deux chemins différents.')

  const authArgs = await buildSvnAuthArgs(compareUrl)

  const fullDiff = await execSvn(['diff', '--internal-diff', ...authArgs, baseUrl, compareUrl])

  // The branch's own revisions (stops at the `svn copy` that created it).
  const logXml = await execSvn([
    'log',
    '--xml',
    '--stop-on-copy',
    '--limit',
    '100',
    ...authArgs,
    compareUrl
  ]).catch(() => '')
  const commits: BranchCompareCommit[] = parseSvnLog(logXml).map((c) => ({
    id: c.shortId,
    title: c.title,
    authorName: c.authorName
  }))

  const stats = parseUnifiedDiffStats(fullDiff)
  const { text: diff, truncated } = truncateDiff(fullDiff, DISPLAY_DIFF_BUDGET)

  const summary = await summarizeBranchDiff({
    vcs: 'svn',
    base: baseLabel,
    compare: compareLabel,
    diff: fullDiff,
    commits
  })

  return {
    base: baseLabel,
    compare: compareLabel,
    diff,
    diffTruncated: truncated,
    commits,
    filesChanged: stats.filesChanged,
    stats: { files: stats.files, additions: stats.additions, deletions: stats.deletions },
    summary
  }
}
