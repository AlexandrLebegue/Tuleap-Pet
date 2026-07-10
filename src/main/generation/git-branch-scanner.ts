import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import type { ActiveBranchStat, CodeBranchInfo, RepoSprintStats } from '@shared/types'
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
  /** Commits (toutes branches) depuis `sinceDate` ; null si non demandé. */
  commitsSince: number | null
  /** Stats détaillées du sprint (branches actives, fichiers, lignes, auteurs). */
  sprintStats: RepoSprintStats | null
}

/** Max de branches actives détaillées dans les stats sprint (mind map). */
const ACTIVE_BRANCH_CAP = 8

function parseDateMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

/**
 * Statistiques d'activité du dépôt depuis `sinceDate` : commits et fichiers
 * touchés toutes branches confondues, auteurs distincts, et détail des
 * branches actives (commits depuis le début, branche née pendant le sprint).
 */
async function computeSprintStats(
  dir: string,
  repoName: string,
  sinceDate: string,
  defaultBranch: string | null,
  allBranches: { name: string; date: string | null }[],
  totalCommits: number
): Promise<RepoSprintStats> {
  // Un seul `git log` pour fichiers / lignes / auteurs : chaque commit émet
  // une ligne marqueur `@@auteur`, suivie de ses lignes numstat `add\tdel\tpath`.
  let filesChanged = 0
  let additions = 0
  let deletions = 0
  let authors = 0
  try {
    const raw = await git(
      dir,
      ['log', '--all', `--since=${sinceDate}`, '--numstat', '--format=@@%an'],
      60_000
    )
    const files = new Set<string>()
    const authorSet = new Set<string>()
    for (const line of raw.split('\n')) {
      if (line.startsWith('@@')) {
        const name = line.slice(2).trim()
        if (name) authorSet.add(name)
        continue
      }
      const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/)
      if (!m) continue
      if (m[1] !== '-') additions += Number.parseInt(m[1] as string, 10)
      if (m[2] !== '-') deletions += Number.parseInt(m[2] as string, 10)
      files.add(m[3] as string)
    }
    filesChanged = files.size
    authors = authorSet.size
  } catch {
    // Dépôt vide : stats à zéro.
  }

  // Branches actives : dernier commit depuis le début du sprint.
  const sinceMs = parseDateMs(sinceDate) ?? 0
  const candidates = allBranches
    .filter((b) => (parseDateMs(b.date) ?? 0) >= sinceMs)
    .sort((a, b) => (parseDateMs(b.date) ?? 0) - (parseDateMs(a.date) ?? 0))
    .slice(0, ACTIVE_BRANCH_CAP)

  const activeBranches: ActiveBranchStat[] = []
  for (const b of candidates) {
    let commits = 0
    try {
      const count = await git(dir, ['rev-list', '--count', `--since=${sinceDate}`, b.name])
      const n = Number.parseInt(count, 10)
      if (Number.isFinite(n)) commits = n
    } catch {
      continue
    }
    if (commits === 0) continue

    // Branche « nouvelle » : son premier commit propre (hors branche par
    // défaut) date d'après le début du sprint.
    let isNew = false
    const isDefault = defaultBranch !== null && b.name === defaultBranch
    if (!isDefault && defaultBranch) {
      try {
        const firstOwn = await git(dir, [
          'log',
          '--reverse',
          '--format=%cI',
          `${defaultBranch}..${b.name}`
        ])
        const first = firstOwn.split('\n')[0]?.trim()
        const firstMs = parseDateMs(first)
        if (firstMs !== null && firstMs >= sinceMs) isNew = true
      } catch {
        // Historique disjoint : on laisse isNew=false.
      }
    }
    activeBranches.push({
      name: b.name,
      commits,
      lastCommitDate: b.date,
      isNew,
      isDefault
    })
  }

  return {
    repoName,
    commits: totalCommits,
    activeBranches,
    filesChanged,
    additions,
    deletions,
    authors
  }
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
  /** Date ISO : compter les commits (toutes branches) depuis cette date. */
  sinceDate?: string | null
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
    const allBranches: { name: string; date: string | null }[] = []
    for (const line of lines) {
      const [name, date, author, subject] = line.split(UNIT_SEP)
      if (!name) continue
      allBranches.push({ name, date: date || null })
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

    // Commits du sprint : toutes branches confondues depuis la date de début.
    let commitsSince: number | null = null
    if (args.sinceDate) {
      try {
        const count = await git(dir, ['rev-list', '--all', '--count', `--since=${args.sinceDate}`])
        const n = Number.parseInt(count, 10)
        if (Number.isFinite(n)) commitsSince = n
      } catch {
        // Dépôt vide ou git trop ancien : pas de comptage.
      }
    }

    // Stats détaillées du sprint (slide « activité dépôt » : gros chiffres + mind map).
    let sprintStats: RepoSprintStats | null = null
    if (args.sinceDate) {
      try {
        sprintStats = await computeSprintStats(
          dir,
          args.repoName,
          args.sinceDate,
          defaultBranch,
          allBranches,
          commitsSince ?? 0
        )
      } catch (err) {
        debugError(
          '[git-branch-scanner] sprint stats failed for %s: %s',
          args.repoName,
          String(err)
        )
      }
    }

    return {
      repoName: args.repoName,
      branches,
      branchesScanned: lines.length,
      defaultBranch,
      commitsSince,
      sprintStats
    }
  } finally {
    try {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
    } catch (err) {
      debugError('[git-branch-scanner] cleanup failed for %s: %s', dir, String(err))
    }
  }
}
