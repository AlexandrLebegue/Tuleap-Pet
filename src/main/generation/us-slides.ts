import type { ArtifactDetail, ArtifactLastUpdate, SprintCodeActivity } from '@shared/types'
import { bucketArtifacts } from '../prompts/sprint-review'
import type { EnrichedContext } from './enricher'

/** Nombre max de lignes du tableau récapitulatif (au-delà : ligne « +N autres »). */
const RECAP_MAX_ROWS = 12
/** Nombre max de slides « une par US » générées. */
const STORY_SLIDES_CAP = 15
/** Nombre max de tâches listées sur une slide US. */
const STORY_TASKS_CAP = 6

function esc(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()
}

function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  return iso.slice(0, 10) || null
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function statusTag(status: string | null): string {
  if (!status) return '<span class="tag tag-blue">Sans statut</span>'
  const bucket = bucketArtifacts([
    {
      id: 0,
      title: '',
      status,
      uri: '',
      htmlUrl: null,
      submittedBy: null,
      submittedOn: null,
      lastModified: null,
      trackerId: 0
    }
  ])
  if (bucket.done.length > 0) return `<span class="tag tag-green">${esc(status)}</span>`
  if (bucket.inProgress.length > 0) return `<span class="tag tag-orange">${esc(status)}</span>`
  return `<span class="tag tag-blue">${esc(status)}</span>`
}

/** Résout la valeur texte d'un champ (subset de resolveFieldValue, sans types exotiques). */
function fieldText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return stripHtml(value) || null
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    const parts = value
      .map((x) =>
        typeof x === 'object' && x !== null
          ? String(
              (x as Record<string, unknown>)['label'] ??
                (x as Record<string, unknown>)['display_name'] ??
                ''
            ).trim()
          : String(x)
      )
      .filter(Boolean)
    return parts.join(', ') || null
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (Array.isArray(obj['values'])) return fieldText(obj['values'])
    if ('value' in obj) return fieldText(obj['value'])
  }
  return null
}

/**
 * Convertit un champ HTML riche en Markdown minimal : les <li> deviennent des
 * puces (les critères d'acceptance sont presque toujours des listes), le reste
 * du balisage est aplati.
 */
function htmlToMarkdown(raw: string): string {
  const withBullets = raw
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(li|p|div|ul|ol)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
  return withBullets
    .replace(/<[^>]+>/g, ' ')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

/** Cherche un champ par mots-clés de label (ex : critères d'acceptance). */
function findFieldByLabel(
  a: ArtifactDetail,
  patterns: RegExp[]
): { label: string; text: string } | null {
  for (const field of a.values) {
    const label = (field.label ?? '').toLowerCase()
    if (!label) continue
    if (patterns.some((p) => p.test(label))) {
      const value = field.value
      const rawString =
        typeof value === 'string'
          ? value
          : typeof value === 'object' &&
              value !== null &&
              typeof (value as Record<string, unknown>)['value'] === 'string'
            ? ((value as Record<string, unknown>)['value'] as string)
            : null
      const text = rawString !== null ? htmlToMarkdown(rawString) : fieldText(value)
      if (text) return { label: field.label, text }
    }
  }
  return null
}

const ACCEPTANCE_PATTERNS = [/crit[eè]re/, /acceptance/, /accepta/, /definition of done/, /dod/]
const EXCLUDED_STORY_FIELDS = new Set([
  'description',
  'details',
  'résumé',
  'resume',
  'summary',
  'title',
  'titre',
  'status',
  'statut',
  'links',
  'artifact id'
])

type TaskStats = { total: number; done: number }

function taskStats(ctx: EnrichedContext, usId: number): TaskStats {
  const childIds = ctx.childrenByParent.get(usId) ?? []
  const byId = new Map(ctx.detailedArtifacts.map((a) => [a.id, a]))
  const children = childIds.map((id) => byId.get(id)).filter((a): a is ArtifactDetail => !!a)
  const buckets = bucketArtifacts(children)
  return { total: childIds.length, done: buckets.done.length }
}

/**
 * Slide « Récapitulatif des user stories » : tableau déterministe de toutes
 * les US du sprint — statut, description courte, tâches (terminées/total),
 * activité code. Aucun appel LLM.
 */
export function buildUsRecapSlide(ctx: EnrichedContext): string | null {
  const stories = ctx.artifacts.filter((a) => !ctx.childArtifactIds.has(a.id))
  if (stories.length === 0) return null

  const byId = new Map(ctx.detailedArtifacts.map((a) => [a.id, a]))
  const rows = stories.slice(0, RECAP_MAX_ROWS).map((s) => {
    const detail = byId.get(s.id)
    const description = detail?.description
      ? esc(stripHtml(detail.description).slice(0, 90))
      : 'N/D'
    const stats = taskStats(ctx, s.id)
    const tasks = stats.total > 0 ? `${stats.done}/${stats.total}` : '—'
    const hasBranch = ctx.codeActivity.branches.some((b) => b.artifactIds.includes(s.id))
    const hasPr = ctx.codeActivity.pullRequests.some((p) => p.artifactIds.includes(s.id))
    const code = [hasBranch ? '🌿' : null, hasPr ? '🔀' : null].filter(Boolean).join(' ') || '—'
    return `| #${s.id} | ${esc(s.title || '(sans titre)').slice(0, 60)} | ${statusTag(s.status)} | ${description} | ${tasks} | ${code} |`
  })
  const overflow =
    stories.length > RECAP_MAX_ROWS
      ? `\n<small>… et ${stories.length - RECAP_MAX_ROWS} autre(s) user stories.</small>`
      : ''

  const buckets = bucketArtifacts(stories)

  return `# 📋 Récapitulatif des user stories

<div class="slide-body">

<div class="stat-bar">
<div class="stat-item">
<span class="stat-icon">📦</span>
<span class="stat-text">
<span class="stat-value">${stories.length}</span>
<span class="stat-label">User stories</span>
</span>
</div>
<div class="stat-item">
<span class="stat-icon">✅</span>
<span class="stat-text">
<span class="stat-value">${buckets.done.length}</span>
<span class="stat-label">Terminées</span>
</span>
</div>
<div class="stat-item">
<span class="stat-icon">🔄</span>
<span class="stat-text">
<span class="stat-value">${buckets.inProgress.length}</span>
<span class="stat-label">En cours</span>
</span>
</div>
<div class="stat-item">
<span class="stat-icon">⏳</span>
<span class="stat-text">
<span class="stat-value">${buckets.todo.length}</span>
<span class="stat-label">À venir</span>
</span>
</div>
</div>

| US | Titre | Statut | Description | Tâches | Code |
|---|---|---|---|---|---|
${rows.join('\n')}
${overflow}

</div>

<div class="slide-footer">
<small>Données Tuleap extraites le ${ctx.generatedAt} — 🌿 branche liée · 🔀 pull request en cours</small>
</div>`
}

function branchStateLabel(b: {
  ahead?: number | null
  behind?: number | null
  baseBranch?: string | null
}): string {
  if (b.ahead === null || b.ahead === undefined) return ''
  if (b.ahead === 0 && (b.behind ?? 0) === 0) return ' — fusionnée / à jour'
  const bits: string[] = []
  bits.push(`↑${b.ahead}`)
  if (b.behind !== null && b.behind !== undefined) bits.push(`↓${b.behind}`)
  return ` — ${bits.join(' ')}${b.baseBranch ? ` vs ${b.baseBranch}` : ''}`
}

function buildOneStorySlide(
  story: ArtifactDetail,
  ctx: EnrichedContext,
  lastUpdate: ArtifactLastUpdate | undefined,
  codeActivity: SprintCodeActivity
): string {
  const byId = new Map(ctx.detailedArtifacts.map((a) => [a.id, a]))
  const childIds = ctx.childrenByParent.get(story.id) ?? []
  const tasks = childIds
    .map((id) => byId.get(id))
    .filter((a): a is ArtifactDetail => !!a)
    .slice(0, STORY_TASKS_CAP)

  const description = story.description
    ? stripHtml(story.description).slice(0, 320)
    : '_Pas de description._'

  const acceptance = findFieldByLabel(story, ACCEPTANCE_PATTERNS)

  // Champs complémentaires (story points, assigné, priorité…), hors champs déjà rendus.
  const extraFields: string[] = []
  for (const field of story.values) {
    if (extraFields.length >= 4) break
    const label = (field.label ?? '').toLowerCase()
    if (!label || EXCLUDED_STORY_FIELDS.has(label)) continue
    if (acceptance && field.label === acceptance.label) continue
    const text = fieldText(field.value)
    if (text) extraFields.push(`- **${field.label} :** ${text.slice(0, 100)}`)
  }

  const taskRows =
    tasks.length === 0
      ? ['| - | Aucune tâche associée | - |']
      : tasks.map(
          (t) =>
            `| #${t.id} | ${esc(t.title || '(sans titre)').slice(0, 55)} | ${statusTag(t.status)} |`
        )
  const taskOverflow =
    childIds.length > STORY_TASKS_CAP
      ? `\n<small>… et ${childIds.length - STORY_TASKS_CAP} autre(s) tâche(s).</small>`
      : ''

  const branches = codeActivity.branches.filter((b) => b.artifactIds.includes(story.id))
  const prs = codeActivity.pullRequests.filter((p) => p.artifactIds.includes(story.id))
  const codeLines: string[] = []
  for (const b of branches.slice(0, 3)) {
    const commit = b.lastCommitTitle
      ? ` · « ${esc(b.lastCommitTitle.slice(0, 45))} » (${shortDate(b.lastCommitDate) ?? 'N/D'})`
      : ''
    codeLines.push(
      `- 🌿 \`${esc(b.branchName)}\` (${esc(b.repoName)})${branchStateLabel(b)}${commit}`
    )
  }
  for (const p of prs.slice(0, 3)) {
    codeLines.push(
      `- 🔀 PR #${p.id} « ${esc(p.title.slice(0, 45))} » — ${esc(p.sourceBranch)} → ${esc(p.targetBranch)}${p.creator ? ` · ${esc(p.creator)}` : ''}`
    )
  }
  if (codeLines.length === 0) codeLines.push('- _Aucune branche ni pull request détectée._')

  const activity = lastUpdate?.date
    ? `${shortDate(lastUpdate.date)}${lastUpdate.author ? ` par ${esc(lastUpdate.author)}` : ''}${lastUpdate.comment ? ` — « ${esc(lastUpdate.comment.slice(0, 110))} »` : ''}`
    : 'N/D'

  const stats = taskStats(ctx, story.id)

  return `# 📘 US #${story.id} — ${esc(story.title || '(sans titre)').slice(0, 70)}

<div class="slide-body">

<div class="columns">
<div class="col">

## Description

${description}

${acceptance ? `## ${esc(acceptance.label)}\n\n${acceptance.text.slice(0, 300)}\n` : ''}
${extraFields.length > 0 ? `${extraFields.join('\n')}\n` : ''}
</div>
<div class="col">

## Tâches (${stats.done}/${stats.total} terminées)

| # | Tâche | Statut |
|---|---|---|
${taskRows.join('\n')}
${taskOverflow}

## Code & activité

${codeLines.join('\n')}

<div class="kpi-card">
<strong>Statut :</strong> ${statusTag(story.status)} · <strong>Dernière activité :</strong> ${activity}
</div>

</div>
</div>

</div>

<div class="slide-footer">
<small>US #${story.id} — données Tuleap extraites le ${ctx.generatedAt}, générée automatiquement sans IA</small>
</div>`
}

/**
 * Slides « une par user story » (option) : description, critères
 * d'acceptance quand le tracker en a, tâches, branches (avec état
 * ahead/behind quand le scan par clone a tourné) et pull requests.
 * 100 % déterministe — aucun appel LLM.
 */
export function buildUsStorySlides(ctx: EnrichedContext): string[] {
  const byId = new Map(ctx.detailedArtifacts.map((a) => [a.id, a]))
  const stories = ctx.artifacts
    .filter((a) => !ctx.childArtifactIds.has(a.id))
    .map((a) => byId.get(a.id))
    .filter((a): a is ArtifactDetail => !!a)
    .slice(0, STORY_SLIDES_CAP)

  return stories.map((s) => buildOneStorySlide(s, ctx, ctx.lastUpdates.get(s.id), ctx.codeActivity))
}
