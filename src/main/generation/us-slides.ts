import type {
  ArtifactDetail,
  ArtifactLastUpdate,
  ArtifactReference,
  ArtifactSummary
} from '@shared/types'
import { bucketArtifacts } from '../prompts/sprint-review'
import type { EnrichedContext } from './enricher'

/** Lignes du tableau récapitulatif par slide (au-delà : pagination). */
const RECAP_ROWS_PER_SLIDE = 7
/** Nombre max de slides « une par US » générées. */
const STORY_SLIDES_CAP = 15
/** Nombre max de tâches listées sur une slide US. */
const STORY_TASKS_CAP = 6
/** Nombre max de badges de références affichés sur une slide US. */
const REF_BADGES_CAP = 10

export function esc(text: string): string {
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

export function statusTag(status: string | null): string {
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
const I_WANT_PATTERNS = [/^i want/, /je veux/, /je souhaite/]
const AS_A_PATTERNS = [/^as an?\b/, /en tant que/]
const SO_THAT_PATTERNS = [/^so that/, /afin de|afin que/]

/**
 * Champs déjà rendus ailleurs ou purement techniques : jamais répétés dans
 * les champs libres des slides.
 */
const EXCLUDED_STORY_FIELDS = [
  /^description$/,
  /^details?$/,
  /^détails?$/,
  /^résumé$|^resume$/,
  /^summary$/,
  /^title$|^titre$/,
  /^status$|^statut$/,
  /^links$/,
  /^artifact id$/,
  /^rank$/,
  /^last modified on$/,
  /^last update date$/,
  /^submitted on$/,
  /^submitted by$/,
  /^soumis par$/,
  /cross reference/,
  /^references$|^références$/,
  /^attachments?$/,
  /^i want to?$/,
  /^so that$/,
  /^as an?$/,
  /^en tant que$/,
  /^je veux$/,
  /^afin de$/
]

/** Traductions FR des labels de champs Tuleap courants (anglais → français). */
const FIELD_LABEL_FR: Record<string, string> = {
  'assigned to': 'Assigné à',
  assignee: 'Assigné à',
  'story points': 'Points',
  'initial effort': 'Effort initial',
  'remaining effort': 'Effort restant',
  'remaining hours': 'Heures restantes',
  'initial hours': 'Heures estimées',
  effort: 'Effort',
  capacity: 'Capacité',
  priority: 'Priorité',
  severity: 'Sévérité',
  category: 'Catégorie',
  release: 'Release',
  sprint: 'Sprint',
  milestone: 'Jalon',
  'due date': 'Échéance',
  'start date': 'Début',
  'end date': 'Fin',
  progress: 'Avancement',
  environment: 'Environnement',
  version: 'Version',
  platform: 'Plateforme',
  component: 'Composant',
  team: 'Équipe'
}

export function translateFieldLabel(label: string): string {
  return FIELD_LABEL_FR[label.toLowerCase()] ?? label
}

function isExcludedField(label: string): boolean {
  const lower = label.toLowerCase()
  return EXCLUDED_STORY_FIELDS.some((p) => p.test(lower))
}

/** Champs « effort / heures » : détectés par label, rendus en chips chiffrées. */
const EFFORT_LABEL_PATTERNS =
  /effort|heures?|hours?|charge|estimation|capacit|remaining|restant|story points?|points/i

function effortUnit(label: string): string {
  const lower = label.toLowerCase()
  if (/points?/.test(lower) && !/heure|hour/.test(lower)) return 'pts'
  return 'h'
}

type EffortChip = { label: string; value: number; unit: string }

/** Extrait les champs numériques d'effort/heures d'un artefact. */
export function extractEffortChips(a: ArtifactDetail): EffortChip[] {
  const chips: EffortChip[] = []
  for (const field of a.values) {
    const label = field.label ?? ''
    if (!label || !EFFORT_LABEL_PATTERNS.test(label)) continue
    const text = fieldText(field.value)
    if (text === null) continue
    const n = Number.parseFloat(text.replace(',', '.'))
    if (!Number.isFinite(n)) continue
    chips.push({ label: translateFieldLabel(label), value: n, unit: effortUnit(label) })
    if (chips.length >= 3) break
  }
  return chips
}

function effortChipsHtml(chips: EffortChip[]): string {
  return `<div class="effort-bar">
${chips
  .map(
    (c) =>
      `<span class="effort-chip"><strong>${Number.isInteger(c.value) ? c.value : c.value.toFixed(1)}</strong> ${c.unit} · ${esc(c.label)}</span>`
  )
  .join('\n')}
</div>`
}

/** Badge coloré pour une référence croisée, selon son type (pr, git, art…). */
function refBadge(r: ArtifactReference): string {
  const kind = r.ref.split(/\s|#/)[0]?.toLowerCase() ?? ''
  const cls = /^(pr|pullrequest)$/.test(kind)
    ? 'tag-orange'
    : /^(git|cmmt|commit)$/.test(kind)
      ? 'tag-green'
      : /^(art|story|task|bug|req|epic)$/.test(kind)
        ? 'tag-blue'
        : 'tag-red'
  const arrow = r.direction === 'in' ? '← ' : r.direction === 'out' ? '→ ' : ''
  return `<span class="tag ${cls}">${arrow}${esc(r.ref)}</span>`
}

export function refBadgesHtml(refs: ArtifactReference[]): string | null {
  if (refs.length === 0) return null
  const shown = refs.slice(0, REF_BADGES_CAP)
  const more =
    refs.length > shown.length ? ` <span class="tag">+${refs.length - shown.length}</span>` : ''
  return `<div class="ref-badges">
${shown.map(refBadge).join('\n')}${more}
</div>`
}

type TaskStats = { total: number; done: number }

function taskStats(ctx: EnrichedContext, usId: number): TaskStats {
  const childIds = ctx.childrenByParent.get(usId) ?? []
  const byId = new Map(ctx.detailedArtifacts.map((a) => [a.id, a]))
  const children = childIds.map((id) => byId.get(id)).filter((a): a is ArtifactDetail => !!a)
  const buckets = bucketArtifacts(children)
  return { total: childIds.length, done: buckets.done.length }
}

/**
 * Citation « user story » mise en avant : privilégie les champs structurés
 * (As a / I want to / So that), sinon repère la formulation dans la
 * description. Le « je veux » est mis en gras.
 */
export function buildStoryQuote(story: ArtifactDetail): string | null {
  const iWant = findFieldByLabel(story, I_WANT_PATTERNS)
  if (iWant) {
    const asA = findFieldByLabel(story, AS_A_PATTERNS)
    const soThat = findFieldByLabel(story, SO_THAT_PATTERNS)
    const parts: string[] = []
    if (asA) parts.push(`En tant que ${asA.text.replace(/^en tant que\s*/i, '')}`)
    parts.push(
      `<em>je veux ${iWant.text.replace(/^(i want to?|je veux|je souhaite)\s*/i, '')}</em>`
    )
    if (soThat) parts.push(`afin de ${soThat.text.replace(/^(so that|afin de|afin que)\s*/i, '')}`)
    return parts.join(', ')
  }
  const desc = story.description ? stripHtml(story.description) : ''
  const m = desc.match(
    /(en tant qu[e'’][^,.]{2,80}[,.]?\s*)?(je veux|je souhaite|i want to?)\s([^.]{4,160})(\.|$)/i
  )
  if (m) {
    const asA = (m[1] ?? '').trim()
    return `${asA ? `${asA.replace(/[,.]\s*$/, '')}, ` : ''}<em>je veux ${m[3]?.trim() ?? ''}</em>`
  }
  return null
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

// ─── Récapitulatif des user stories (paginé) ─────────────────────────────────

function recapStatBar(stories: ArtifactSummary[]): string {
  const buckets = bucketArtifacts(stories)
  return `<div class="stat-bar">
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
</div>`
}

/**
 * Slides « Récapitulatif des user stories » : tableau déterministe de toutes
 * les US du sprint — titre et description issus du détail de chaque artefact
 * (les items de milestone content sont parfois lacunaires), statut, tâches
 * terminées/total, activité code. Paginé : au-delà de RECAP_ROWS_PER_SLIDE
 * lignes, le tableau continue sur une slide suivante. Aucun appel LLM.
 */
export function buildUsRecapSlides(ctx: EnrichedContext): string[] {
  const stories = ctx.artifacts.filter((a) => !ctx.childArtifactIds.has(a.id))
  if (stories.length === 0) return []

  const byId = new Map(ctx.detailedArtifacts.map((a) => [a.id, a]))
  const rows = stories.map((s) => {
    const detail = byId.get(s.id)
    const title = esc(s.title || detail?.title || '(sans titre)').slice(0, 55)
    const status = s.status ?? detail?.status ?? null
    const description = detail?.description ? esc(stripHtml(detail.description)).slice(0, 80) : '—'
    const stats = taskStats(ctx, s.id)
    const tasks = stats.total > 0 ? `${stats.done}/${stats.total}` : '—'
    const hasBranch = ctx.codeActivity.branches.some((b) => b.artifactIds.includes(s.id))
    const hasPr = ctx.codeActivity.pullRequests.some((p) => p.artifactIds.includes(s.id))
    const code = [hasBranch ? '🌿' : null, hasPr ? '🔀' : null].filter(Boolean).join(' ') || '—'
    return `| #${s.id} | ${title} | ${statusTag(status)} | ${description} | ${tasks} | ${code} |`
  })

  // Pagination : première slide avec stat-bar + N lignes, suivantes plus denses.
  const pages: string[][] = []
  for (let i = 0; i < rows.length; i += RECAP_ROWS_PER_SLIDE) {
    pages.push(rows.slice(i, i + RECAP_ROWS_PER_SLIDE))
  }

  return pages.map((pageRows, pageIndex) => {
    const pageSuffix = pages.length > 1 ? ` (${pageIndex + 1}/${pages.length})` : ''
    const statBar = pageIndex === 0 ? `\n${recapStatBar(stories)}\n` : ''
    return `# 📋 Récapitulatif des user stories${pageSuffix}

<div class="slide-body">
${statBar}
| US | Titre | Statut | Description | Tâches | Code |
|---|---|---|---|---|---|
${pageRows.join('\n')}

</div>

<div class="slide-footer">
<small>Données Tuleap extraites le ${ctx.generatedAt} — 🌿 branche liée · 🔀 pull request en cours</small>
</div>`
  })
}

// ─── Slides détaillées par user story ────────────────────────────────────────

function buildOneStorySlide(story: ArtifactDetail, ctx: EnrichedContext): string {
  const lastUpdate: ArtifactLastUpdate | undefined = ctx.lastUpdates.get(story.id)
  const codeActivity = ctx.codeActivity
  const byId = new Map(ctx.detailedArtifacts.map((a) => [a.id, a]))
  const childIds = ctx.childrenByParent.get(story.id) ?? []
  const tasks = childIds
    .map((id) => byId.get(id))
    .filter((a): a is ArtifactDetail => !!a)
    .slice(0, STORY_TASKS_CAP)

  // ── Colonne gauche : le récit de l'US ──────────────────────────────────
  const left: string[] = []

  const quote = buildStoryQuote(story)
  if (quote) {
    left.push(`<div class="us-quote">${quote}</div>`)
  }

  const description = story.description ? stripHtml(story.description) : null
  // La description n'est répétée que si elle apporte plus que la citation.
  if (description && (!quote || description.length > quote.length + 40)) {
    left.push(`## Description\n\n${description.slice(0, 340)}`)
  }

  const acceptance = findFieldByLabel(story, ACCEPTANCE_PATTERNS)
  if (acceptance) {
    left.push(
      `## ${esc(translateFieldLabel(acceptance.label))}\n\n${acceptance.text.slice(0, 320)}`
    )
  }

  const effortChips = extractEffortChips(story)
  if (effortChips.length > 0) {
    left.push(effortChipsHtml(effortChips))
  }

  // Champs complémentaires traduits (assigné, priorité…), hors déjà rendus.
  const effortLabels = new Set(effortChips.map((c) => c.label))
  const extraFields: string[] = []
  for (const field of story.values) {
    if (extraFields.length >= 4) break
    const label = field.label ?? ''
    if (!label || isExcludedField(label)) continue
    if (acceptance && field.label === acceptance.label) continue
    const translated = translateFieldLabel(label)
    if (effortLabels.has(translated)) continue
    const text = fieldText(field.value)
    if (text) extraFields.push(`- **${esc(translated)} :** ${esc(text).slice(0, 100)}`)
  }
  if (extraFields.length > 0) left.push(extraFields.join('\n'))

  const refsHtml = refBadgesHtml(story.crossReferences ?? [])
  if (refsHtml) {
    left.push(`## Références\n\n${refsHtml}`)
  }

  // ── Colonne droite : exécution (tâches, code, activité) ────────────────
  const right: string[] = []

  if (tasks.length > 0) {
    const stats = taskStats(ctx, story.id)
    const taskRows = tasks.map(
      (t) =>
        `| #${t.id} | ${esc(t.title || '(sans titre)').slice(0, 55)} | ${statusTag(t.status)} |`
    )
    const taskOverflow =
      childIds.length > STORY_TASKS_CAP
        ? `\n<small>… et ${childIds.length - STORY_TASKS_CAP} autre(s) tâche(s).</small>`
        : ''
    right.push(
      `## Tâches (${stats.done}/${stats.total} terminées)\n\n| # | Tâche | Statut |\n|---|---|---|\n${taskRows.join('\n')}${taskOverflow}`
    )
  }

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
  if (codeLines.length > 0) {
    right.push(`## Code\n\n${codeLines.join('\n')}`)
  }

  const metaBits: string[] = [`<strong>Statut :</strong> ${statusTag(story.status)}`]
  if (lastUpdate?.date) {
    const who = lastUpdate.author ? ` par ${esc(lastUpdate.author)}` : ''
    metaBits.push(`<strong>Dernière activité :</strong> ${shortDate(lastUpdate.date)}${who}`)
  } else if (story.lastModified) {
    metaBits.push(`<strong>Dernière modification :</strong> ${story.lastModified.slice(0, 10)}`)
  }
  if (story.submittedBy) {
    metaBits.push(`<strong>Créée par :</strong> ${esc(story.submittedBy)}`)
  }
  const metaCard = `<div class="kpi-card">\n${metaBits.join(' · ')}\n</div>`
  const commentCard = lastUpdate?.comment
    ? `<blockquote>\n« ${esc(lastUpdate.comment.slice(0, 160))} »\n</blockquote>`
    : ''
  right.push([metaCard, commentCard].filter(Boolean).join('\n\n'))

  // ── Assemblage : deux colonnes si la droite a du contenu, sinon pleine largeur
  const body =
    right.length > 1 || tasks.length > 0 || codeLines.length > 0
      ? `<div class="columns">
<div class="col">

${left.join('\n\n')}

</div>
<div class="col">

${right.join('\n\n')}

</div>
</div>`
      : `${left.join('\n\n')}\n\n${right.join('\n\n')}`

  return `# 📘 US #${story.id} — ${esc(story.title || '(sans titre)').slice(0, 70)}

<div class="slide-body">

${body}

</div>

<div class="slide-footer">
<small>US #${story.id} — données Tuleap du ${ctx.generatedAt}</small>
</div>`
}

/**
 * Slides « une par user story » (option) : citation mise en avant (je veux…),
 * description, critères d'acceptance, effort/heures, champs traduits en
 * français, badges de références croisées (PRs, commits, artefacts), tâches,
 * branches (état ahead/behind) et pull requests. Le layout s'adapte aux
 * données réellement disponibles : les sections vides ne sont pas affichées.
 * 100 % déterministe — aucun appel LLM.
 */
export function buildUsStorySlides(ctx: EnrichedContext): string[] {
  const byId = new Map(ctx.detailedArtifacts.map((a) => [a.id, a]))
  const stories = ctx.artifacts
    .filter((a) => !ctx.childArtifactIds.has(a.id))
    .map((a) => byId.get(a.id))
    .filter((a): a is ArtifactDetail => !!a)
    .slice(0, STORY_SLIDES_CAP)

  return stories.map((s) => buildOneStorySlide(s, ctx))
}
