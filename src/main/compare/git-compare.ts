import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { getConfig } from '../store/config'
import { execGit } from '../commenter/git-utils'
import { injectGitCredentials, explainGitAuthFailure } from '../jobs/git-credentials'
import { parseUnifiedDiffStats, truncateDiff } from './diff-utils'
import { summarizeBranchDiff } from './feature-summary'
import { debugError } from '../logger'
import type { BranchCompareResult, BranchCompareCommit } from '@shared/types'

const execFileAsync = promisify(execFile)

/** Max diff chars returned to the renderer for display (the LLM gets a smaller slice). */
const DISPLAY_DIFF_BUDGET = 200_000
const UNIT_SEP = '\x1f'

/**
 * Compare two git branches: clone the repo (all branches, no tags), compute the
 * three-dot diff (what `compare` adds relative to the merge-base with `base`),
 * the commits unique to `compare`, and an AI summary of the new features.
 */
export async function compareGitBranches(args: {
  repoName: string
  cloneUrl: string
  base: string
  compare: string
}): Promise<BranchCompareResult> {
  const { repoName, cloneUrl, base, compare } = args
  if (base === compare) throw new Error('Choisissez deux branches différentes.')

  const { tempClonePath } = getConfig()
  if (!tempClonePath) throw new Error('Aucun dossier temporaire configuré dans les réglages.')

  const safe = repoName.replace(/[^\w.-]+/g, '_')
  const dir = path.join(tempClonePath, `${safe}_cmp_${randomBytes(3).toString('hex')}`)

  try {
    const credUrl = await injectGitCredentials(cloneUrl)
    try {
      await execFileAsync('git', ['clone', '--no-tags', '--quiet', credUrl, dir], {
        maxBuffer: 50 * 1024 * 1024
      })
    } catch (cloneErr) {
      const raw = cloneErr instanceof Error ? cloneErr.message : String(cloneErr)
      throw new Error(explainGitAuthFailure(raw) ?? raw)
    }

    const baseRef = await resolveRef(dir, base)
    const compareRef = await resolveRef(dir, compare)

    const diffRange = `${baseRef}...${compareRef}`
    const fullDiff = await execGit(['diff', diffRange], dir)
    const numstat = await execGit(['diff', '--numstat', diffRange], dir)
    const logRaw = await execGit(
      ['log', `${baseRef}..${compareRef}`, `--pretty=format:%H${UNIT_SEP}%s${UNIT_SEP}%an`],
      dir
    )

    const stats = parseNumstat(numstat)
    const commits = parseGitLog(logRaw)
    const { text: diff, truncated } = truncateDiff(fullDiff, DISPLAY_DIFF_BUDGET)

    const summary = await summarizeBranchDiff({
      vcs: 'git',
      base,
      compare,
      diff: fullDiff,
      commits
    })

    return {
      base,
      compare,
      diff,
      diffTruncated: truncated,
      commits,
      filesChanged: stats.filesChanged,
      stats: { files: stats.files, additions: stats.additions, deletions: stats.deletions },
      summary
    }
  } finally {
    try {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
    } catch (err) {
      debugError('[git-compare] cleanup failed: %s', String(err))
    }
  }
}

/** Resolve a user-supplied branch name to a ref that exists in the fresh clone. */
async function resolveRef(dir: string, name: string): Promise<string> {
  for (const candidate of [`origin/${name}`, name, `refs/remotes/origin/${name}`]) {
    try {
      await execGit(['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`], dir)
      return candidate
    } catch {
      /* try next */
    }
  }
  throw new Error(`Branche introuvable dans le dépôt : ${name}`)
}

/** Parse `git diff --numstat` output: "<add>\t<del>\t<path>" per line. */
function parseNumstat(numstat: string): {
  files: number
  additions: number
  deletions: number
  filesChanged: string[]
} {
  const files: string[] = []
  let additions = 0
  let deletions = 0
  for (const line of numstat.split('\n')) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    if (parts.length < 3) continue
    const add = parts[0] === '-' ? 0 : Number.parseInt(parts[0]!, 10) || 0
    const del = parts[1] === '-' ? 0 : Number.parseInt(parts[1]!, 10) || 0
    additions += add
    deletions += del
    files.push(parts.slice(2).join('\t'))
  }
  return { files: files.length, additions, deletions, filesChanged: files }
}

function parseGitLog(raw: string): BranchCompareCommit[] {
  if (!raw.trim()) return []
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id = '', title = '', authorName = ''] = line.split(UNIT_SEP)
      return { id: id.slice(0, 10), title, authorName }
    })
}

// Re-export for tests that exercise the numstat parser via the diff-utils path.
export { parseUnifiedDiffStats }
