import type {
  ArtifactSummary,
  SprintReviewProgressEvent,
  SprintReviewSlideType
} from '@shared/types'
import type { LlmProvider } from '../llm'
import { getPrompt, interpolate } from '../prompts/loader'
import { bucketArtifacts } from '../prompts/sprint-review'
import {
  stripFences,
  detectUnmatchedPlaceholders,
  formatArtifactSummaryBlock,
  formatArtifactBlock,
  formatCodeActivityBlock,
  formatRecentUpdatesBlock
} from './utils'
import { buildCodeActivitySlide } from './code-activity-slide'
import { buildUsRecapSlides, buildUsStorySlides } from './us-slides'
import { buildEpicSlides } from './epic-slides'
import { buildRepoActivitySlides } from './repo-activity-slides'
import { buildCommitPieBlock } from './commit-pie'
import type { EnrichedContext } from './enricher'

export type SlideResult =
  | { type: SprintReviewSlideType; ok: true; markdown: string; warnings: string[] }
  | { type: SprintReviewSlideType; ok: false; error: string }

/**
 * Slides du deck, dans l'ordre de présentation. Les slides `build` sont
 * générés en code (données Tuleap rendues telles quelles) : pas d'appel LLM,
 * donc pas de risque d'hallucination sur les US / branches / PRs. Un builder
 * peut retourner plusieurs slides (une par US), une seule, ou null (omis).
 */
type SlideDefinition =
  | { type: SprintReviewSlideType; promptKey: string; build?: undefined }
  | { type: SprintReviewSlideType; build: (ctx: EnrichedContext) => string | string[] | null }

function buildSlideDefinitions(ctx: EnrichedContext): SlideDefinition[] {
  const defs: SlideDefinition[] = [
    { type: 'titre', promptKey: 'slide_titre' },
    { type: 'contexte', promptKey: 'slide_contexte' },
    { type: 'us_recap', build: buildUsRecapSlides },
    { type: 'epic', build: buildEpicSlides },
    { type: 'equipe', promptKey: 'slide_equipe' },
    { type: 'livrables', promptKey: 'slide_livrables' },
    { type: 'avancement', promptKey: 'slide_avancement' }
  ]
  if (ctx.storySlides) {
    defs.push({ type: 'us_story', build: buildUsStorySlides })
  }
  defs.push(
    { type: 'code_activity', build: (c) => buildCodeActivitySlide(c.codeActivity, c.generatedAt) },
    { type: 'repo_activity', build: buildRepoActivitySlides },
    { type: 'indicateurs', promptKey: 'slide_indicateurs' },
    { type: 'risques', promptKey: 'slide_risques' },
    { type: 'synthese', promptKey: 'slide_synthese' }
  )
  return defs
}

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

  // For custom (non-sprint) mode, some slides benefit from a focused artifact subset
  const primaryArtifacts = (() => {
    switch (type) {
      case 'livrables':
        return ctx.detailedArtifacts.filter((a) => {
          const s = (a.status ?? '').toLowerCase()
          return (
            s.includes('done') || s.includes('ferm') || s.includes('termin') || s.includes('clos')
          )
        })
      case 'risques':
        return ctx.detailedArtifacts.filter((a) => {
          const s = (a.status ?? '').toLowerCase()
          return (
            !s.includes('done') &&
            !s.includes('ferm') &&
            !s.includes('termin') &&
            !s.includes('clos')
          )
        })
      default:
        return ctx.detailedArtifacts
    }
  })()

  const trackerHint = ctx.trackerLabel ? `\nType d'artefacts : ${ctx.trackerLabel}` : ''

  return {
    project_name: ctx.projectName,
    sprint_name: ctx.trackerLabel ? `${ctx.label} — ${ctx.trackerLabel}` : ctx.label,
    sprint_start: ctx.milestone ? formatDate(ctx.milestone.startDate) : 'inconnue',
    sprint_end: ctx.milestone ? formatDate(ctx.milestone.endDate) : 'inconnue',
    sprint_status: ctx.milestone
      ? sprintStatus
      : ctx.trackerLabel
        ? `Personnalisé (${ctx.trackerLabel})`
        : 'Personnalisé',
    artifact_count: total,
    done_count: doneCount,
    in_progress_count: inProgressCount,
    todo_count: todoCount,
    completion_rate: completionRate,
    date: ctx.generatedAt,
    summary: summary.slice(0, 1200) + trackerHint,
    artifacts_block: formatArtifactBlock(primaryArtifacts, {
      childIds: ctx.childArtifactIds,
      childrenByParent: ctx.childrenByParent,
      lastUpdates: ctx.lastUpdates,
      codeActivity: ctx.codeActivity
    }),
    done_artifacts_block: formatArtifactSummaryBlock(buckets.done),
    in_progress_artifacts_block: formatArtifactSummaryBlock(buckets.inProgress),
    todo_artifacts_block: formatArtifactSummaryBlock(buckets.todo),
    contributors_block: buildContributorsBlock(ctx.detailedArtifacts),
    code_activity_block: formatCodeActivityBlock(ctx.codeActivity),
    recent_updates_block: formatRecentUpdatesBlock(
      [...ctx.artifacts, ...ctx.detailedArtifacts.filter((a) => ctx.childArtifactIds.has(a.id))],
      ctx.lastUpdates
    )
  }
}

export async function generateAllSlides(
  provider: LlmProvider,
  ctx: EnrichedContext,
  summary: string,
  onProgress: (e: SprintReviewProgressEvent) => void
): Promise<{
  results: SlideResult[]
  usages: ({ inputTokens?: number; outputTokens?: number; totalTokens?: number } | null)[]
  model: string
}> {
  const results: SlideResult[] = []
  const usages: ({ inputTokens?: number; outputTokens?: number; totalTokens?: number } | null)[] =
    []
  let lastModel = ''
  const definitions = buildSlideDefinitions(ctx)
  const total = definitions.length

  let i = 0
  for (const def of definitions) {
    const type = def.type
    i++
    onProgress({ type: 'slide_start', slide: type, index: i, total })

    if (def.build) {
      // Slide(s) généré(s) en code : données Tuleap rendues sans passer par le LLM.
      try {
        const built = def.build(ctx)
        const markdowns = built === null ? [] : Array.isArray(built) ? built : [built]
        for (const markdown of markdowns) {
          results.push({ type, ok: true, markdown, warnings: [] })
        }
        // Rien à montrer → slide simplement omis, sans erreur ni warning.
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        results.push({ type, ok: false, error: message })
        onProgress({ type: 'slide_error', slide: type, index: i, total, error: message })
        continue
      }
      onProgress({ type: 'slide_done', slide: type, index: i, total })
      continue
    }

    try {
      const tpl = getPrompt(def.promptKey)
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

      let cleaned = stripFences(result.text)
      // Injection post-LLM : le marqueur [[ACTIVITE_DEPOTS]] du slide équipe
      // est remplacé par le camembert pré-rendu (le LLM ne recopie qu'une
      // ligne, pas 20 lignes de HTML — bien plus fiable avec un petit modèle).
      if (cleaned.includes('[[ACTIVITE_DEPOTS]]')) {
        cleaned = cleaned.replace(
          '[[ACTIVITE_DEPOTS]]',
          buildCommitPieBlock(ctx.codeActivity, ctx.milestone?.startDate ?? null)
        )
      }
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
