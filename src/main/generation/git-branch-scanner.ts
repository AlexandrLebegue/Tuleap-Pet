import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import type { CodeBranchInfo } from '@shared/types'
import { debugError } from '../logger'
import { matchArtifactIds } from './artifact-matching'

const execFileAsync = promisify(execFile)

/** Budget de clone par dépôt — au-delà on abandonne ce dépôt (best effort). */
const CLONE_TIMEOUT_MS = 120_000
const GIT_TIMEOUT_MS = 30_000
const UNIT_SEP = '\x1f'

export type CloneScanResult = {
  repoName: string
  /** Branches dont le nom référence un artefact du sprint, avec ahead/behind. */
  branches: CodeBranchInfo[]
  /** Nombre total de branches du dépôt. */
  branchesScanned: number
  defaultBranch: string | null
}

async function git(dir: string, args: string[], timeoutMs = GIT_TIMEOUT_MS): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', dir, ...args], {
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024
  })
  return stdout.trim()
}

/**
 * Clone un dépôt (bare, sans blobs ni tags — rapide et léger : refs + commits
 * uniquement) puis inventorie ses branches : celles dont le nom référence un
 * artefact du sprint sont retournées avec leur dernier commit et leur écart
 * ahead/behind vis-à-vis de la branche par défaut. Le clone est supprimé
 * avant de rendre la main.
 */
export async function scanRepoBranchesByClone(args: {
  repoName: string
  /** URL de clone, credentials déjà injectés par l'appelant. */
  cloneUrl: string
  knownIds: Set<number>
  tempClonePath: string
}): Promise<CloneScanResult> {
  const safe = args.repoName.replace(/[^\w.-]+/g, '_')
  const dir = path.join(args.tempClonePath, `${safe}_scan_${randomBytes(3).toString('hex')}`)

  try {
    await execFileAsync(
      'git',
      ['clone', '--bare', '--filter=blob:none', '--no-tags', '--quiet', args.cloneUrl, dir],
      { timeout: CLONE_TIMEOUT_MS, maxBuffer: 50 * 1024 * 1024 }
    )

    let defaultBranch: string | null = null
    try {
      defaultBranch = (await git(dir, ['symbolic-ref', '--short', 'HEAD'])) || null
    } catch {
      // HEAD détaché ou dépôt vide : ahead/behind indisponibles.
    }

    const raw = await git(dir, [
      'for-each-ref',
      `--format=%(refname:short)${UNIT_SEP}%(committerdate:iso8601-strict)${UNIT_SEP}%(authorname)${UNIT_SEP}%(subject)`,
      'refs/heads'
    ])
    const lines = raw ? raw.split('\n').filter(Boolean) : []

    const branches: CodeBranchInfo[] = []
    for (const line of lines) {
      const [name, date, author, subject] = line.split(UNIT_SEP)
      if (!name) continue
      const artifactIds = matchArtifactIds(name, args.knownIds)
      if (artifactIds.length === 0) continue

      let ahead: number | null = null
      let behind: number | null = null
      if (defaultBranch && name !== defaultBranch) {
        try {
          const counts = await git(dir, [
            'rev-list',
            '--left-right',
            '--count',
            `${defaultBranch}...${name}`
          ])
          const [left, right] = counts.split(/\s+/).map((n) => Number.parseInt(n, 10))
          if (left !== undefined && Number.isFinite(left)) behind = left
          if (right !== undefined && Number.isFinite(right)) ahead = right
        } catch {
          // merge-base introuvable (historique disjoint) : on laisse null.
        }
      } else if (defaultBranch && name === defaultBranch) {
        ahead = 0
        behind = 0
      }

      branches.push({
        repoName: args.repoName,
        branchName: name,
        artifactIds,
        lastCommitTitle: subject || null,
        lastCommitAuthor: author || null,
        lastCommitDate: date || null,
        ahead,
        behind,
        baseBranch: defaultBranch
      })
    }

    return { repoName: args.repoName, branches, branchesScanned: lines.length, defaultBranch }
  } finally {
    try {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
    } catch (err) {
      debugError('[git-branch-scanner] cleanup failed for %s: %s', dir, String(err))
    }
  }
}
