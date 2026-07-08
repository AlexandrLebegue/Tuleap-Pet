import type { LlmProvider } from '../llm'
import { getPrompt, interpolate } from '../prompts/loader'
import { bucketArtifacts } from '../prompts/sprint-review'
import {
  formatArtifactBlock,
  formatArtifactSummaryBlock,
  formatCodeActivityBlock,
  formatRecentUpdatesBlock,
  stripFences
} from './utils'
import type { EnrichedContext } from './enricher'

function formatDate(iso: string | null): string {
  if (!iso) return 'inconnue'
  return iso.slice(0, 10) || 'inconnue'
}

export async function generateSprintSummary(
  provider: LlmProvider,
  ctx: EnrichedContext
): Promise<{
  text: string
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null
  model: string
}> {
  const buckets = bucketArtifacts(ctx.artifacts)
  const tpl = getPrompt('sprint_summary')

  const artifactsBlock =
    ctx.detailedArtifacts.length > 0
      ? formatArtifactBlock(ctx.detailedArtifacts, {
          childIds: ctx.childArtifactIds,
          childrenByParent: ctx.childrenByParent,
          lastUpdates: ctx.lastUpdates,
          codeActivity: ctx.codeActivity
        })
      : formatArtifactSummaryBlock(ctx.artifacts)

  const vars: Record<string, string | number> = {
    project_name: ctx.projectName,
    sprint_name: ctx.trackerLabel ? `${ctx.label} — ${ctx.trackerLabel}` : ctx.label,
    sprint_start: ctx.milestone ? formatDate(ctx.milestone.startDate) : 'inconnue',
    sprint_end: ctx.milestone ? formatDate(ctx.milestone.endDate) : 'inconnue',
    artifact_count: ctx.artifacts.length,
    done_count: buckets.done.length,
    in_progress_count: buckets.inProgress.length,
    todo_count: buckets.todo.length,
    language: ctx.language,
    artifacts_block: artifactsBlock,
    code_activity_block: formatCodeActivityBlock(ctx.codeActivity),
    recent_updates_block: formatRecentUpdatesBlock(
      [...ctx.artifacts, ...ctx.detailedArtifacts.filter((a) => ctx.childArtifactIds.has(a.id))],
      ctx.lastUpdates
    )
  }

  const userMessage = interpolate(tpl.userTemplate, vars)
  const result = await provider.generate({
    messages: [
      { role: 'system', content: tpl.system },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.2,
    maxOutputTokens: 2048
  })

  return {
    text: stripFences(result.text),
    usage: result.usage,
    model: result.model
  }
}
