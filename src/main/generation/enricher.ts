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
/** Max epics détaillés (slides + contexte LLM). */
const EPIC_CAP = 8

/** Un epic (artefact parent des US du sprint, tracker de type « epic »). */
export type EpicInfo = {
  detail: ArtifactDetail
  /** Label du tracker de l'epic (ex : "Epics"). */
  trackerLabel: string | null
  /** IDs des US du sprint rattachées à cet epic. */
  storyIds: number[]
}

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
  /** Epics du sprint (parents des US, trackers de type « epic »). */
  epics: EpicInfo[]
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
 * Identifie les epics du sprint : pour chaque US top-level on remonte ses
 * parents (liens `_is_child` en sens inverse) ; les parents dont le tracker
 * ressemble à un epic (label / item_name / titre contenant « epic ») sont
 * retenus avec la liste des US du sprint qui leur sont rattachées.
 */
async function fetchEpics(
  client: TuleapClient,
  topLevel: ArtifactSummary[],
  childArtifactIds: Set<number>
): Promise<EpicInfo[]> {
  const stories = topLevel.filter((a) => !childArtifactIds.has(a.id))

  // US → parents (reverse links), best effort.
  const parentResults = await Promise.allSettled(
    stories.map((story) =>
      client
        .listLinkedArtifacts(story.id, { nature: '_is_child', direction: 'reverse', limit: 50 })
        .then((page) => ({ storyId: story.id, parents: page.items.map(mapArtifactSummary) }))
    )
  )

  const storiesByParent = new Map<number, number[]>()
  const parentSummaries = new Map<number, ArtifactSummary>()
  for (const r of parentResults) {
    if (r.status !== 'fulfilled') continue
    for (const parent of r.value.parents) {
      parentSummaries.set(parent.id, parent)
      const ids = storiesByParent.get(parent.id) ?? []
      ids.push(r.value.storyId)
      storiesByParent.set(parent.id, ids)
    }
  }
  if (parentSummaries.size === 0) return []

  // Labels des trackers des parents (dédupliqués), pour reconnaître les epics.
  const trackerIds = [...new Set([...parentSummaries.values()].map((p) => p.trackerId))]
  const trackerInfo = new Map<number, { display: string; match: string }>()
  const trackerResults = await Promise.allSettled(trackerIds.map((id) => client.getTracker(id)))
  for (const r of trackerResults) {
    if (r.status === 'fulfilled') {
      trackerInfo.set(r.value.id, {
        display: r.value.label,
        match: `${r.value.label} ${r.value.item_name ?? ''}`
      })
    }
  }

  const isEpic = (p: ArtifactSummary): boolean => {
    const match = trackerInfo.get(p.trackerId)?.match ?? ''
    return /epic/i.test(match) || /^epic\b/i.test(p.title)
  }

  const epicParents = [...parentSummaries.values()].filter(isEpic).slice(0, EPIC_CAP)
  if (epicParents.length === 0) return []

  const detailResults = await Promise.allSettled(
    epicParents.map((p) => client.getArtifact(p.id).then(mapArtifactDetail))
  )
  const epics: EpicInfo[] = []
  detailResults.forEach((r, i) => {
    const parent = epicParents[i]
    if (r.status !== 'fulfilled' || !parent) return
    epics.push({
      detail: r.value,
      trackerLabel: trackerInfo.get(parent.trackerId)?.display ?? null,
      storyIds: storiesByParent.get(parent.id) ?? []
    })
  })
  return epics
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
  opts: { deepScan: boolean; sinceDate: string | null },
  onProgress: (e: SprintReviewProgressEvent) => void
): Promise<SprintCodeActivity> {
  const deepScan = opts.deepScan
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
  let commitsByRepo: { repoName: string; commits: number }[] | undefined
  let repoSprintStats: SprintCodeActivity['repoSprintStats']
  const branches: CodeBranchInfo[] = []

  // Scan profond : clone de chaque dépôt (ahead/behind, dernier commit exact,
  // commits depuis le début du sprint). Import dynamique — le module tire la
  // config Electron, inutile de le charger quand l'option n'est pas cochée.
  if (deepScan) {
    onProgress({ type: 'code_scan', step: 'clone' })
    try {
      const { deepScanBranches } = await import('./deep-scan')
      const deep = await deepScanBranches(scanned, knownIds, opts.sinceDate)
      warnings.push(...deep.warnings)
      if (deep.clonedRepos > 0) {
        branches.push(...deep.branches)
        branchesScanned = deep.branchesScanned
        scanMethod = 'clone'
        commitsByRepo = deep.commitsByRepo
        repoSprintStats = deep.repoSprintStats
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
    scanMethod,
    commitsByRepo,
    repoSprintStats
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

  // Les items de /milestones/{id}/content sont parfois lacunaires (id sans
  // titre ni statut selon la version de Tuleap) : on consolide les summaries
  // avec les données du détail, source de vérité.
  const detailById = new Map(detailedArtifacts.map((d) => [d.id, d]))
  artifacts = artifacts.map((a) => {
    const d = detailById.get(a.id)
    if (!d) return a
    return {
      ...a,
      title: a.title || d.title,
      status: a.status ?? d.status,
      submittedBy: a.submittedBy ?? d.submittedBy,
      submittedOn: a.submittedOn ?? d.submittedOn,
      lastModified: a.lastModified ?? d.lastModified,
      htmlUrl: a.htmlUrl ?? d.htmlUrl
    }
  })

  const childArtifactIds = new Set(childrenCapped.map((c) => c.id))

  // Epics : parents des US dont le tracker est de type « epic » (best effort).
  let epics: EpicInfo[] = []
  try {
    epics = await fetchEpics(client, topLevel, childArtifactIds)
  } catch {
    // Liens reverse indisponibles sur cette instance : pas de slides epic.
  }

  // Dernières mises à jour (changesets) : US en priorité, puis sous-tâches.
  const lastUpdates = await fetchLastUpdates(
    client,
    [...topLevel.map((a) => a.id), ...childrenCapped.map((c) => c.id)],
    onProgress
  )

  // Branches & pull requests des dépôts Git du projet (best effort).
  // knownIds inclut US + sous-tâches : une branche `task-456` remonte aussi.
  // Avec storySlides, le scan clone chaque dépôt pour un état exact (ahead/behind)
  // et compte les commits depuis le début du sprint (camembert du slide équipe).
  const codeActivity = await scanCodeActivity(
    client,
    projectId,
    knownIds,
    { deepScan: storySlides, sinceDate: milestone?.startDate ?? null },
    onProgress
  )

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
    epics,
    storySlides,
    language,
    generatedAt: new Date().toISOString().slice(0, 10)
  }
}
