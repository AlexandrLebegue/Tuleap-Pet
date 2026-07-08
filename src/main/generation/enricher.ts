import type {
  ArtifactDetail,
  ArtifactLastUpdate,
  ArtifactSummary,
  CodeBranchInfo,
  CodePullRequestInfo,
  GenerationSource,
  MilestoneSummary,
  SprintCodeActivity,
  SprintReviewProgressEvent
} from '@shared/types'
import {
  buildTuleapClient,
  mapArtifactDetail,
  mapArtifactSummary,
  mapMilestone,
  mapMilestoneContentItem
} from '../tuleap'
import type { TuleapClient } from '../tuleap/client'
import type { ArtifactChangesetRaw, GitRepositoryRaw } from '../tuleap/schemas'
import { matchArtifactIds } from './artifact-matching'

/** Max top-level artifacts to enrich with full detail */
const ENRICH_CAP = 40
/** Max child artifacts to enrich (across all parents) */
const CHILD_ENRICH_CAP = 60
/** Max artifacts for which we fetch the changeset history (dernières mises à jour) */
const ACTIVITY_CAP = 60
/** Max changesets fetched per artifact (le plus récent suffit, marge pour commentaires vides) */
const CHANGESETS_PER_ARTIFACT = 5
/** Max git repositories scanned for branches / pull requests */
const REPO_SCAN_CAP = 15
/** Max branches fetched per repository */
const BRANCH_SCAN_CAP = 200

export type EnrichedContext = {
  projectName: string
  label: string
  /** Tracker / artifact type label for custom mode (e.g. "Anomalies", "Exigences"). */
  trackerLabel: string | null
  milestone: MilestoneSummary | null
  /** Top-level sprint content items — used for stats (done/in-progress/todo counts) */
  artifacts: ArtifactSummary[]
  /** Fully enriched artifacts: top-level + children, for LLM context */
  detailedArtifacts: ArtifactDetail[]
  /** IDs of child artifacts (sub-tasks) so formatters can show hierarchy */
  childArtifactIds: Set<number>
  /** Parent artifact id → ids of its direct children (sub-tasks). */
  childrenByParent: Map<number, number[]>
  /** Artifact id → last known activity (changesets: date, author, last comment). */
  lastUpdates: Map<number, ArtifactLastUpdate>
  /** Git branches / pull requests discovered on the project's repositories. */
  codeActivity: SprintCodeActivity
  /** True quand l'utilisateur a demandé une slide détaillée par user story. */
  storySlides: boolean
  language: 'fr' | 'en'
  generatedAt: string
}

/**
 * Fetch one level of child artifacts for the given parent IDs, deduplicated
 * against knownIds. Also returns the parent → children mapping so the
 * formatters can render the US → tâches hierarchy.
 */
async function fetchChildArtifacts(
  client: TuleapClient,
  parentIds: number[],
  knownIds: Set<number>
): Promise<{ children: ArtifactSummary[]; childrenByParent: Map<number, number[]> }> {
  const childResults = await Promise.allSettled(
    parentIds.map((id) =>
      client
        .fetchAll((offset) =>
          client.listLinkedArtifacts(id, { nature: '_is_child', direction: 'forward', offset })
        )
        .then((items) => ({ parentId: id, items: items.map(mapArtifactSummary) }))
    )
  )

  const children: ArtifactSummary[] = []
  const childrenByParent = new Map<number, number[]>()
  for (const r of childResults) {
    if (r.status !== 'fulfilled') continue
    const ids: number[] = []
    for (const child of r.value.items) {
      ids.push(child.id)
      if (!knownIds.has(child.id)) {
        knownIds.add(child.id)
        children.push(child)
      }
    }
    if (ids.length > 0) childrenByParent.set(r.value.parentId, ids)
  }
  return { children, childrenByParent }
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function changesetAuthor(cs: ArtifactChangesetRaw): string | null {
  const details = cs.submitted_by_details
  if (details) {
    const name =
      (details.display_name ?? '').trim() ||
      (details.real_name ?? '').trim() ||
      (details.username ?? '').trim()
    if (name) return name
  }
  return null
}

/** Condense a list of changesets (ordered newest first) into an ArtifactLastUpdate. */
export function summarizeChangesets(changesets: ArtifactChangesetRaw[]): ArtifactLastUpdate {
  const latest = changesets[0]
  let comment: string | null = null
  // Le changeset le plus récent n'a pas forcément de commentaire (simple
  // changement de champ) : on prend le commentaire non vide le plus récent.
  for (const cs of changesets) {
    const body = stripHtml(cs.last_comment?.body ?? '')
    if (body) {
      comment = body.slice(0, 280)
      break
    }
  }
  return {
    date: latest?.submitted_on ?? null,
    author: latest ? changesetAuthor(latest) : null,
    comment,
    changesetCount: changesets.length
  }
}

/** Fetch the recent changesets of the given artifacts (best effort, parallel). */
async function fetchLastUpdates(
  client: TuleapClient,
  artifactIds: number[],
  onProgress: (e: SprintReviewProgressEvent) => void
): Promise<Map<number, ArtifactLastUpdate>> {
  const targets = artifactIds.slice(0, ACTIVITY_CAP)
  const total = targets.length
  let done = 0
  const results = await Promise.allSettled(
    targets.map(async (id) => {
      const page = await client.listArtifactChangesets(id, {
        limit: CHANGESETS_PER_ARTIFACT,
        fields: 'comments'
      })
      done++
      onProgress({ type: 'activity', index: done, total })
      return { id, update: summarizeChangesets(page.items) }
    })
  )
  const map = new Map<number, ArtifactLastUpdate>()
  for (const r of results) {
    if (r.status === 'fulfilled') map.set(r.value.id, r.value.update)
  }
  return map
}

export { matchArtifactIds } from './artifact-matching'

function repoDisplayName(repo: GitRepositoryRaw): string {
  return repo.name || repo.path_without_project || repo.path || `repo-${repo.id}`
}

/**
 * Scan the project's git repositories: branches whose name references a sprint
 * artifact, and every open pull request. Fully best-effort — a repo that fails
 * (permissions, plugin absent…) is skipped and reported in `warnings`.
 */
async function scanCodeActivity(
  client: TuleapClient,
  projectId: number,
  knownIds: Set<number>,
  deepScan: boolean,
  onProgress: (e: SprintReviewProgressEvent) => void
): Promise<SprintCodeActivity> {
  const empty: SprintCodeActivity = {
    reposScanned: 0,
    branchesScanned: 0,
    branches: [],
    pullRequests: [],
    warnings: [],
    scanMethod: 'api'
  }

  onProgress({ type: 'code_scan', step: 'repos' })
  let repos: GitRepositoryRaw[]
  try {
    repos = await client.fetchAll((offset) => client.listGitRepositories(projectId, { offset }))
  } catch (err) {
    empty.warnings.push(
      `Dépôts Git inaccessibles : ${err instanceof Error ? err.message : String(err)}`
    )
    return empty
  }

  const scanned = repos.slice(0, REPO_SCAN_CAP)
  const warnings: string[] = []
  if (repos.length > scanned.length) {
    warnings.push(`${repos.length - scanned.length} dépôt(s) non scanné(s) (cap ${REPO_SCAN_CAP}).`)
  }

  let branchesScanned = 0
  let scanMethod: 'api' | 'clone' = 'api'
  const branches: CodeBranchInfo[] = []

  // Scan profond : clone de chaque dépôt (ahead/behind, dernier commit exact).
  // Import dynamique — le module tire la config Electron, inutile de le
  // charger quand l'option n'est pas cochée.
  if (deepScan) {
    onProgress({ type: 'code_scan', step: 'clone' })
    try {
      const { deepScanBranches } = await import('./deep-scan')
      const deep = await deepScanBranches(scanned, knownIds)
      warnings.push(...deep.warnings)
      if (deep.clonedRepos > 0) {
        branches.push(...deep.branches)
        branchesScanned = deep.branchesScanned
        scanMethod = 'clone'
      }
    } catch (err) {
      warnings.push(
        `Scan par clone indisponible : ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  // Scan API (toujours utilisé en fallback quand le clone n'a rien donné).
  if (scanMethod === 'api') {
    onProgress({ type: 'code_scan', step: 'branches' })
    const branchResults = await Promise.allSettled(
      scanned.map(async (repo) => {
        const items = await client.fetchAll(async (offset) => {
          const page = await client.listBranches(repo.id, { offset })
          // fetchAll s'arrête quand items.length >= total : on borne aussi ici.
          return offset + page.items.length >= BRANCH_SCAN_CAP
            ? { ...page, total: Math.min(page.total, offset + page.items.length) }
            : page
        })
        return { repo, items }
      })
    )
    for (const r of branchResults) {
      if (r.status !== 'fulfilled') {
        warnings.push(
          `Branches illisibles sur un dépôt : ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`
        )
        continue
      }
      branchesScanned += r.value.items.length
      for (const b of r.value.items) {
        const artifactIds = matchArtifactIds(b.name, knownIds)
        if (artifactIds.length === 0) continue
        branches.push({
          repoName: repoDisplayName(r.value.repo),
          branchName: b.name,
          artifactIds,
          lastCommitTitle: b.commit?.title ?? null,
          lastCommitAuthor: b.commit?.author_name ?? null,
          lastCommitDate: b.commit?.authored_date ?? null
        })
      }
    }
  }

  onProgress({ type: 'code_scan', step: 'pull_requests' })
  const pullRequests: CodePullRequestInfo[] = []
  const prResults = await Promise.allSettled(
    scanned.map(async (repo) => {
      const page = await client.listPullRequests(repo.id, { status: 'open', limit: 50 })
      return { repo, items: page.items }
    })
  )
  for (const r of prResults) {
    if (r.status !== 'fulfilled') {
      warnings.push(
        `Pull requests illisibles sur un dépôt : ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`
      )
      continue
    }
    for (const pr of r.value.items) {
      const creator = pr.creator
      const creatorName = creator
        ? (creator.display_name ?? '').trim() ||
          (creator.real_name ?? '').trim() ||
          (creator.username ?? '').trim() ||
          null
        : null
      pullRequests.push({
        id: pr.id,
        title: pr.title,
        repoName: pr.repository?.name || repoDisplayName(r.value.repo),
        sourceBranch: pr.branch_src,
        targetBranch: pr.branch_dest,
        status: pr.status,
        htmlUrl: pr.html_url || null,
        creator: creatorName,
        createdAt: pr.creation_date ?? null,
        artifactIds: matchArtifactIds(`${pr.branch_src} ${pr.title}`, knownIds)
      })
    }
  }

  return {
    reposScanned: scanned.length,
    branchesScanned,
    branches,
    pullRequests,
    warnings,
    scanMethod
  }
}

export async function buildEnrichedContext(
  source: GenerationSource,
  projectName: string,
  projectId: number,
  language: 'fr' | 'en',
  onProgress: (e: SprintReviewProgressEvent) => void,
  options?: { storySlides?: boolean }
): Promise<EnrichedContext> {
  const storySlides = options?.storySlides ?? false
  const client = await buildTuleapClient()
  let milestone: MilestoneSummary | null = null
  let artifacts: ArtifactSummary[] = []
  let label: string

  let trackerLabel: string | null = null

  if (source.mode === 'sprint') {
    const milestoneRaw = await client.getMilestone(source.milestoneId)
    milestone = mapMilestone(milestoneRaw)
    label = milestone.label
    const contentItems = await client.fetchAll((offset) =>
      client.listMilestoneContent(source.milestoneId, { limit: 50, offset })
    )
    artifacts = contentItems.map(mapMilestoneContentItem)
  } else {
    label = source.label
    trackerLabel = source.trackerLabel ?? null
    const results = await Promise.allSettled(source.artifactIds.map((id) => client.getArtifact(id)))
    for (const r of results) {
      if (r.status === 'fulfilled') {
        artifacts.push(mapArtifactSummary(r.value))
      }
    }
  }

  // Track all seen IDs to avoid duplicates
  const knownIds = new Set(artifacts.map((a) => a.id))

  // Fetch one level of children for the top-level artifacts
  const topLevel = artifacts.slice(0, ENRICH_CAP)
  const { children, childrenByParent } = await fetchChildArtifacts(
    client,
    topLevel.map((a) => a.id),
    knownIds
  )
  const childrenCapped = children.slice(0, CHILD_ENRICH_CAP)
  const cappedChildIds = new Set(childrenCapped.map((c) => c.id))
  // Les enfants au-delà du cap ne seront pas détaillés : on nettoie le mapping.
  for (const [parentId, ids] of childrenByParent) {
    const kept = ids.filter((id) => cappedChildIds.has(id))
    if (kept.length > 0) childrenByParent.set(parentId, kept)
    else childrenByParent.delete(parentId)
  }

  // Enrich top-level + children in parallel
  const toEnrich = [...topLevel, ...childrenCapped]
  const totalToEnrich = toEnrich.length

  const detailResults = await Promise.allSettled(
    toEnrich.map(async (a, index) => {
      onProgress({ type: 'enriching', index: index + 1, total: totalToEnrich })
      const raw = await client.getArtifact(a.id)
      return mapArtifactDetail(raw)
    })
  )

  const detailedArtifacts: ArtifactDetail[] = []
  for (const r of detailResults) {
    if (r.status === 'fulfilled') {
      detailedArtifacts.push(r.value)
    }
  }

  const childArtifactIds = new Set(childrenCapped.map((c) => c.id))

  // Dernières mises à jour (changesets) : US en priorité, puis sous-tâches.
  const lastUpdates = await fetchLastUpdates(
    client,
    [...topLevel.map((a) => a.id), ...childrenCapped.map((c) => c.id)],
    onProgress
  )

  // Branches & pull requests des dépôts Git du projet (best effort).
  // knownIds inclut US + sous-tâches : une branche `task-456` remonte aussi.
  // Avec storySlides, le scan clone chaque dépôt pour un état exact (ahead/behind).
  const codeActivity = await scanCodeActivity(client, projectId, knownIds, storySlides, onProgress)

  return {
    projectName,
    label,
    trackerLabel,
    milestone,
    artifacts, // top-level only — for stats
    detailedArtifacts, // top-level + children — for LLM context
    childArtifactIds,
    childrenByParent,
    lastUpdates,
    codeActivity,
    storySlides,
    language,
    generatedAt: new Date().toISOString().slice(0, 10)
  }
}
