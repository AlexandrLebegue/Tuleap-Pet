import type { ArtifactSummary, MilestoneSummary } from '@shared/types'
import { getPrompt, interpolate } from './loader'
import type { LlmMessage } from '../llm'

export type SprintReviewContext = {
  projectName: string
  milestone: MilestoneSummary
  artifacts: ArtifactSummary[]
  language?: 'fr' | 'en'
}

const DONE_STATUSES = ['done', 'closed', 'fermé', 'fermee', 'fini', 'fini(e)', 'terminé', 'terminee', 'resolved', 'resolu']
const IN_PROGRESS_STATUSES = ['in progress', 'en cours', 'wip', 'doing', 'review']

function bucketStatus(raw: string | null): 'done' | 'in_progress' | 'todo' {
  if (!raw) return 'todo'
  const lower = raw.toLowerCase().trim()
  if (DONE_STATUSES.includes(lower)) return 'done'
  if (IN_PROGRESS_STATUSES.includes(lower)) return 'in_progress'
  return 'todo'
}

export function bucketArtifacts(artifacts: ArtifactSummary[]): {
  done: ArtifactSummary[]
  inProgress: ArtifactSummary[]
  todo: ArtifactSummary[]
} {
  const done: ArtifactSummary[] = []
  const inProgress: ArtifactSummary[] = []
  const todo: ArtifactSummary[] = []
  for (const a of artifacts) {
    const bucket = bucketStatus(a.status)
    if (bucket === 'done') done.push(a)
    else if (bucket === 'in_progress') inProgress.push(a)
    else todo.push(a)
  }
  return { done, inProgress, todo }
}

function formatArtifactsBlock(artifacts: ArtifactSummary[]): string {
  if (artifacts.length === 0) return '_Aucun item._'
  return artifacts
    .map((a) => {
      const status = a.status ?? 'sans statut'
      const submitter = a.submittedBy ? ` (par ${a.submittedBy})` : ''
      const title = a.title || '(sans titre)'
      return `- #${a.id} [${status}] ${title}${submitter}`
    })
    .join('\n')
}

function formatDate(iso: string | null): string {
  if (!iso) return 'inconnue'
  const trimmed = iso.slice(0, 10)
  return trimmed || 'inconnue'
}

export function buildSprintReviewMessages(ctx: SprintReviewContext): LlmMessage[] {
  const buckets = bucketArtifacts(ctx.artifacts)
  const tpl = getPrompt('sprint_review')
  const vars: Record<string, string | number> = {
    project_name: ctx.projectName,
    sprint_name: ctx.milestone.label,
    sprint_status:
      ctx.milestone.semanticStatus === 'closed' || ctx.milestone.status === 'closed'
        ? 'Clos'
        : 'Ouvert',
    sprint_start: formatDate(ctx.milestone.startDate),
    sprint_end: formatDate(ctx.milestone.endDate),
    artifact_count: ctx.artifacts.length,
    done_count: buckets.done.length,
    in_progress_count: buckets.inProgress.length,
    todo_count: buckets.todo.length,
    language: ctx.language ?? 'fr',
    artifacts_block: formatArtifactsBlock(ctx.artifacts)
  }
  const userMessage = interpolate(tpl.userTemplate, vars)
  return [
    { role: 'system', content: tpl.system },
    { role: 'user', content: userMessage }
  ]
}
