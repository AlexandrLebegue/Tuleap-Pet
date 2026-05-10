import type { ArtifactSummary, SprintReviewProgressEvent, SprintReviewSlideType } from '@shared/types'
import type { LlmProvider } from '../llm'
import { getPrompt, interpolate } from '../prompts/loader'
import { bucketArtifacts } from '../prompts/sprint-review'
import { stripFences, detectUnmatchedPlaceholders, formatArtifactSummaryBlock, formatArtifactBlock } from './utils'
import type { EnrichedContext } from './enricher'

export type SlideResult =
  | { type: SprintReviewSlideType; ok: true; markdown: string; warnings: string[] }
  | { type: SprintReviewSlideType; ok: false; error: string }

const SLIDE_DEFINITIONS: ReadonlyArray<{ type: SprintReviewSlideType; promptKey: string }> = [
  { type: 'titre', promptKey: 'slide_titre' },
  { type: 'contexte', promptKey: 'slide_contexte' },
  { type: 'equipe', promptKey: 'slide_equipe' },
  { type: 'livrables', promptKey: 'slide_livrables' },
  { type: 'avancement', promptKey: 'slide_avancement' },
  { type: 'indicateurs', promptKey: 'slide_indicateurs' },
  { type: 'risques', promptKey: 'slide_risques' },
  { type: 'synthese', promptKey: 'slide_synthese' }
]

function buildContributorsBlock(artifacts: ArtifactSummary[]): string {
  const counts = new Map<string, number>()
  for (const a of artifacts) {
    if (!a.submittedBy) continue
    counts.set(a.submittedBy, (counts.get(a.submittedBy) ?? 0) + 1)
  }
  if (counts.size === 0) return '_Aucun contributeur identifié._'
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `- ${name} (${n} artefact${n > 1 ? 's' : ''})`)
    .join('\n')
}

function formatDate(iso: string | null): string {
  if (!iso) return 'inconnue'
  return iso.slice(0, 10) || 'inconnue'
}

function buildSlideVars(
  type: SprintReviewSlideType,
  ctx: EnrichedContext,
  summary: string
): Record<string, string | number> {
  const buckets = bucketArtifacts(ctx.artifacts)
  const total = ctx.artifacts.length
  const doneCount = buckets.done.length
  const inProgressCount = buckets.inProgress.length
  const todoCount = buckets.todo.length
  const completionRate = total > 0 ? Math.round((doneCount / total) * 100) : 0

  const sprintStatus =
    ctx.milestone?.semanticStatus === 'closed' || ctx.milestone?.status === 'closed'
      ? 'Clos'
      : 'Ouvert'

  const base: Record<string, string | number> = {
    project_name: ctx.projectName,
    sprint_name: ctx.label,
    sprint_start: ctx.milestone ? formatDate(ctx.milestone.startDate) : 'inconnue',
    sprint_end: ctx.milestone ? formatDate(ctx.milestone.endDate) : 'inconnue',
    sprint_status: sprintStatus,
    artifact_count: total,
    done_count: doneCount,
    in_progress_count: inProgressCount,
    todo_count: todoCount,
    completion_rate: completionRate,
    date: ctx.generatedAt,
    summary: summary.slice(0, 1200),
    artifacts_block: formatArtifactBlock(ctx.detailedArtifacts, ctx.childArtifactIds),
    done_artifacts_block: formatArtifactSummaryBlock(buckets.done),
    in_progress_artifacts_block: formatArtifactSummaryBlock(buckets.inProgress),
    todo_artifacts_block: formatArtifactSummaryBlock(buckets.todo),
    contributors_block: buildContributorsBlock(ctx.detailedArtifacts)
  }

  void type
  return base
}

export async function generateAllSlides(
  provider: LlmProvider,
  ctx: EnrichedContext,
  summary: string,
  onProgress: (e: SprintReviewProgressEvent) => void
): Promise<{ results: SlideResult[]; usages: ({ inputTokens?: number; outputTokens?: number; totalTokens?: number } | null)[]; model: string }> {
  const results: SlideResult[] = []
  const usages: ({ inputTokens?: number; outputTokens?: number; totalTokens?: number } | null)[] = []
  let lastModel = ''
  const total = SLIDE_DEFINITIONS.length

  let i = 0
  for (const { type, promptKey } of SLIDE_DEFINITIONS) {
    i++
    onProgress({ type: 'slide_start', slide: type, index: i, total })

    try {
      const tpl = getPrompt(promptKey)
      const vars = buildSlideVars(type, ctx, summary)
      const userMessage = interpolate(tpl.userTemplate, vars)

      const result = await provider.generate({
        messages: [
          { role: 'system', content: tpl.system },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.3,
        maxOutputTokens: 1024
      })

      const cleaned = stripFences(result.text)
      const unmatched = detectUnmatchedPlaceholders(cleaned)

      usages.push(result.usage)
      lastModel = result.model
      results.push({ type, ok: true, markdown: cleaned, warnings: unmatched })
      onProgress({ type: 'slide_done', slide: type, index: i, total })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      usages.push(null)
      results.push({ type, ok: false, error: message })
      onProgress({ type: 'slide_error', slide: type, index: i, total, error: message })
    }
  }

  return { results, usages, model: lastModel }
}
