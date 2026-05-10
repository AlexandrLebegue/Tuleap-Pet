import type { ArtifactDetail, ArtifactSummary, GenerationSource, MilestoneSummary, SprintReviewProgressEvent } from '@shared/types'
import {
  buildTuleapClient,
  mapArtifactDetail,
  mapArtifactSummary,
  mapMilestone,
  mapMilestoneContentItem
} from '../tuleap'
import type { TuleapClient } from '../tuleap/client'

/** Max top-level artifacts to enrich with full detail */
const ENRICH_CAP = 40
/** Max child artifacts to enrich (across all parents) */
const CHILD_ENRICH_CAP = 60

export type EnrichedContext = {
  projectName: string
  label: string
  milestone: MilestoneSummary | null
  /** Top-level sprint content items — used for stats (done/in-progress/todo counts) */
  artifacts: ArtifactSummary[]
  /** Fully enriched artifacts: top-level + children, for LLM context */
  detailedArtifacts: ArtifactDetail[]
  /** IDs of child artifacts (sub-tasks) so formatters can show hierarchy */
  childArtifactIds: Set<number>
  language: 'fr' | 'en'
  generatedAt: string
}

/** Fetch one level of child artifacts for the given parent IDs, deduplicated against knownIds. */
async function fetchChildArtifacts(
  client: TuleapClient,
  parentIds: number[],
  knownIds: Set<number>
): Promise<ArtifactSummary[]> {
  const childResults = await Promise.allSettled(
    parentIds.map((id) =>
      client
        .fetchAll((offset) => client.listLinkedArtifacts(id, { nature: '_is_child', direction: 'forward', offset }))
        .then((items) => items.map(mapArtifactSummary))
    )
  )

  const children: ArtifactSummary[] = []
  for (const r of childResults) {
    if (r.status !== 'fulfilled') continue
    for (const child of r.value) {
      if (!knownIds.has(child.id)) {
        knownIds.add(child.id)
        children.push(child)
      }
    }
  }
  return children
}

export async function buildEnrichedContext(
  source: GenerationSource,
  projectName: string,
  language: 'fr' | 'en',
  onProgress: (e: SprintReviewProgressEvent) => void
): Promise<EnrichedContext> {
  const client = await buildTuleapClient()
  let milestone: MilestoneSummary | null = null
  let artifacts: ArtifactSummary[] = []
  let label: string

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
    const results = await Promise.allSettled(
      source.artifactIds.map((id) => client.getArtifact(id))
    )
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
  const children = await fetchChildArtifacts(client, topLevel.map((a) => a.id), knownIds)
  const childrenCapped = children.slice(0, CHILD_ENRICH_CAP)

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

  return {
    projectName,
    label,
    milestone,
    artifacts,          // top-level only — for stats
    detailedArtifacts,  // top-level + children — for LLM context
    childArtifactIds,
    language,
    generatedAt: new Date().toISOString().slice(0, 10)
  }
}
