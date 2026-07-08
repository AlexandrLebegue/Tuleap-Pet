import type {
  ArtifactDetail,
  ArtifactLastUpdate,
  ArtifactSummary,
  SprintCodeActivity
} from '@shared/types'

export function stripFences(text: string): string {
  return text.replace(/^```(?:\w+)?\n([\s\S]*?)\n```\s*$/m, '$1').trim()
}

export function detectUnmatchedPlaceholders(text: string): string[] {
  const matches = text.match(/\{[A-Z][A-Z0-9_]+\}/g)
  return matches ?? []
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extracts a human-readable string from a Tuleap field value.
 * Handles both the default API format and values_format=collection.
 * field.value is the `rest` object from rawToFieldValue:
 *   text/string:  { value: "..." }
 *   computed:     { value: 5, is_autocomputed: true, manual_value: null }
 *   selectbox:    { values: [{ id, label }] }
 *   person:       { values: [{ display_name, username, id }] }
 *   file:         { file_descriptions: [...] }
 */
function resolveFieldValue(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string') return stripHtml(raw) || null
  if (typeof raw === 'number') return String(raw)
  if (Array.isArray(raw)) {
    const parts = raw
      .map((x) => {
        if (typeof x === 'object' && x !== null) {
          const obj = x as Record<string, unknown>
          return String(obj['label'] ?? obj['display_name'] ?? obj['real_name'] ?? '').trim()
        }
        return String(x)
      })
      .filter(Boolean)
    return parts.join(', ') || null
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    if ('values' in obj && Array.isArray(obj['values'])) {
      return resolveFieldValue(obj['values'])
    }
    if ('value' in obj) {
      if (obj['value'] === null || obj['value'] === undefined) {
        const mv = obj['manual_value']
        return mv !== null && mv !== undefined ? String(mv) : null
      }
      if (typeof obj['value'] === 'string') return stripHtml(obj['value']) || null
      if (typeof obj['value'] === 'number') return String(obj['value'])
      return resolveFieldValue(obj['value'])
    }
    if ('file_descriptions' in obj && Array.isArray(obj['file_descriptions'])) {
      return `${(obj['file_descriptions'] as unknown[]).length} fichier(s)`
    }
  }
  return null
}

/** Champs déjà rendus explicitement, à ne pas répéter dans les champs libres. */
const REDUNDANT_FIELD_LABELS = new Set([
  'description',
  'details',
  'résumé',
  'resume',
  'summary',
  'title',
  'titre',
  'status',
  'statut',
  'submitted by',
  'soumis par',
  'submitted on',
  'links',
  'artifact id'
])

/** Optional context to render hierarchy + code/activity data per artifact. */
export type ArtifactBlockContext = {
  childIds?: Set<number>
  /** Parent id → child ids ; quand fourni, les sous-tâches sont imbriquées sous leur US. */
  childrenByParent?: Map<number, number[]>
  lastUpdates?: Map<number, ArtifactLastUpdate>
  codeActivity?: SprintCodeActivity
}

function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = iso.slice(0, 10)
  return d || null
}

function formatOneArtifact(
  a: ArtifactDetail,
  opts: {
    isChild: boolean
    lastUpdate?: ArtifactLastUpdate
    codeActivity?: SprintCodeActivity
    childLines?: string[]
  }
): string {
  const heading = opts.isChild
    ? `#### ↳ #${a.id} — ${a.title || '(sans titre)'} _(sous-tâche)_`
    : `### #${a.id} — ${a.title || '(sans titre)'}`
  const lines: string[] = [heading]
  if (a.status) lines.push(`- **Statut :** ${a.status}`)
  if (a.description) lines.push(`- **Description :** ${stripHtml(a.description).slice(0, 300)}`)
  if (a.submittedBy) lines.push(`- **Soumis par :** ${a.submittedBy}`)
  if (a.submittedOn) lines.push(`- **Date soumission :** ${a.submittedOn.slice(0, 10)}`)
  if (a.values.length > 0) {
    let shown = 0
    for (const field of a.values) {
      if (shown >= 8) break
      if (REDUNDANT_FIELD_LABELS.has((field.label ?? '').toLowerCase())) continue
      const val = resolveFieldValue(field.value)
      if (val && val.length > 0) {
        lines.push(`- **${field.label} :** ${val.slice(0, 150)}`)
        shown++
      }
    }
  }

  // Dernière activité (changesets) : date + auteur + extrait de commentaire.
  const lu = opts.lastUpdate
  if (lu && (lu.date || lu.comment)) {
    const date = shortDate(lu.date) ?? 'date inconnue'
    const author = lu.author ? ` par ${lu.author}` : ''
    lines.push(`- **Dernière mise à jour :** ${date}${author}`)
    if (lu.comment) lines.push(`- **Dernier commentaire :** ${lu.comment.slice(0, 200)}`)
  } else if (a.lastModified) {
    lines.push(`- **Dernière mise à jour :** ${a.lastModified.slice(0, 10)}`)
  }

  // Branches / PRs rattachées à cet artefact.
  const ca = opts.codeActivity
  if (ca) {
    const branches = ca.branches.filter((b) => b.artifactIds.includes(a.id))
    for (const b of branches) {
      const meta = [b.lastCommitAuthor, shortDate(b.lastCommitDate)].filter(Boolean).join(', ')
      const commit = b.lastCommitTitle
        ? ` — dernier commit : « ${b.lastCommitTitle.slice(0, 80)} »${meta ? ` (${meta})` : ''}`
        : ''
      lines.push(`- **Branche :** \`${b.branchName}\` (dépôt ${b.repoName})${commit}`)
    }
    const prs = ca.pullRequests.filter((p) => p.artifactIds.includes(a.id))
    for (const p of prs) {
      const who = p.creator ? ` par ${p.creator}` : ''
      lines.push(
        `- **Pull request :** PR #${p.id} « ${p.title.slice(0, 80)} » (${p.sourceBranch} → ${p.targetBranch}, statut ${p.status})${who}`
      )
    }
  }

  if (opts.childLines && opts.childLines.length > 0) {
    lines.push('', ...opts.childLines)
  }
  return lines.join('\n')
}

export function formatArtifactBlock(
  artifacts: ArtifactDetail[],
  childIdsOrCtx?: Set<number> | ArtifactBlockContext
): string {
  if (artifacts.length === 0) return '_Aucun artefact détaillé disponible._'
  const ctx: ArtifactBlockContext =
    childIdsOrCtx instanceof Set ? { childIds: childIdsOrCtx } : (childIdsOrCtx ?? {})
  const childIds = ctx.childIds ?? new Set<number>()
  const byId = new Map(artifacts.map((a) => [a.id, a]))

  // Sans hiérarchie fournie : rendu à plat (comportement historique).
  if (!ctx.childrenByParent) {
    return artifacts
      .map((a) =>
        formatOneArtifact(a, {
          isChild: childIds.has(a.id),
          lastUpdate: ctx.lastUpdates?.get(a.id),
          codeActivity: ctx.codeActivity
        })
      )
      .join('\n\n')
  }

  // Rendu hiérarchique : chaque US suivie de ses sous-tâches, puis les
  // artefacts orphelins (sous-tâches dont le parent n'est pas dans la liste).
  const rendered = new Set<number>()
  const blocks: string[] = []
  for (const a of artifacts) {
    if (childIds.has(a.id)) continue
    rendered.add(a.id)
    const childLines: string[] = []
    for (const childId of ctx.childrenByParent.get(a.id) ?? []) {
      const child = byId.get(childId)
      if (!child) continue
      rendered.add(childId)
      childLines.push(
        formatOneArtifact(child, {
          isChild: true,
          lastUpdate: ctx.lastUpdates?.get(childId),
          codeActivity: ctx.codeActivity
        })
      )
    }
    blocks.push(
      formatOneArtifact(a, {
        isChild: false,
        lastUpdate: ctx.lastUpdates?.get(a.id),
        codeActivity: ctx.codeActivity,
        childLines
      })
    )
  }
  for (const a of artifacts) {
    if (rendered.has(a.id)) continue
    blocks.push(
      formatOneArtifact(a, {
        isChild: childIds.has(a.id),
        lastUpdate: ctx.lastUpdates?.get(a.id),
        codeActivity: ctx.codeActivity
      })
    )
  }
  return blocks.join('\n\n')
}

/**
 * Bloc « activité code » pour les prompts : PRs en cours puis branches actives.
 * Compact et déterministe — le LLM n'a rien à recouper.
 */
export function formatCodeActivityBlock(activity: SprintCodeActivity | undefined): string {
  if (!activity || (activity.branches.length === 0 && activity.pullRequests.length === 0)) {
    return '_Aucune branche ni pull request détectée sur les dépôts Git du projet._'
  }
  const lines: string[] = []
  if (activity.pullRequests.length > 0) {
    lines.push(`**Pull requests en cours (${activity.pullRequests.length}) :**`)
    for (const p of activity.pullRequests.slice(0, 15)) {
      const who = p.creator ? ` — par ${p.creator}` : ''
      const when = shortDate(p.createdAt) ? ` — ouverte le ${shortDate(p.createdAt)}` : ''
      const arts =
        p.artifactIds.length > 0
          ? ` — artefacts : ${p.artifactIds.map((i) => `#${i}`).join(', ')}`
          : ''
      lines.push(
        `- PR #${p.id} « ${p.title.slice(0, 90)} » : ${p.sourceBranch} → ${p.targetBranch} [${p.status}]${who}${when}${arts}`
      )
    }
    if (activity.pullRequests.length > 15) {
      lines.push(`- … et ${activity.pullRequests.length - 15} autre(s) pull request(s).`)
    }
  }
  if (activity.branches.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push(`**Branches liées aux artefacts du sprint (${activity.branches.length}) :**`)
    for (const b of activity.branches.slice(0, 15)) {
      const arts = b.artifactIds.map((i) => `#${i}`).join(', ')
      const meta = [b.lastCommitAuthor, shortDate(b.lastCommitDate)].filter(Boolean).join(', ')
      const commit = b.lastCommitTitle
        ? ` — dernier commit « ${b.lastCommitTitle.slice(0, 70)} »${meta ? ` (${meta})` : ''}`
        : ''
      lines.push(`- \`${b.branchName}\` (dépôt ${b.repoName}) → ${arts}${commit}`)
    }
    if (activity.branches.length > 15) {
      lines.push(`- … et ${activity.branches.length - 15} autre(s) branche(s).`)
    }
  }
  return lines.join('\n')
}

/**
 * Bloc « dernières mises à jour » : les artefacts les plus récemment modifiés,
 * triés par date décroissante, avec auteur et extrait du dernier commentaire.
 */
export function formatRecentUpdatesBlock(
  artifacts: ArtifactSummary[],
  lastUpdates: Map<number, ArtifactLastUpdate>,
  max = 12
): string {
  const entries = artifacts
    .map((a) => ({ a, u: lastUpdates.get(a.id) }))
    .filter((e): e is { a: ArtifactSummary; u: ArtifactLastUpdate } => !!e.u && !!e.u.date)
    .sort((x, y) => (y.u.date ?? '').localeCompare(x.u.date ?? ''))
    .slice(0, max)
  if (entries.length === 0) return '_Aucune activité récente détectée._'
  return entries
    .map(({ a, u }) => {
      const who = u.author ? ` par ${u.author}` : ''
      const comment = u.comment ? ` : « ${u.comment.slice(0, 120)} »` : ''
      return `- ${shortDate(u.date)} — #${a.id} ${a.title || '(sans titre)'} [${a.status ?? 'sans statut'}]${who}${comment}`
    })
    .join('\n')
}

export function formatArtifactSummaryBlock(artifacts: ArtifactSummary[]): string {
  if (artifacts.length === 0) return '_Aucun item._'
  return artifacts
    .map((a) => {
      const status = a.status ?? 'sans statut'
      const submitter = a.submittedBy ? ` (par ${a.submittedBy})` : ''
      return `- #${a.id} [${status}] ${a.title || '(sans titre)'}${submitter}`
    })
    .join('\n')
}

export function aggregateUsage(
  usages: ({ inputTokens?: number; outputTokens?: number; totalTokens?: number } | null)[]
): { inputTokens: number; outputTokens: number; totalTokens: number } {
  let inputTokens = 0
  let outputTokens = 0
  let totalTokens = 0
  for (const u of usages) {
    if (!u) continue
    inputTokens += u.inputTokens ?? 0
    outputTokens += u.outputTokens ?? 0
    totalTokens += u.totalTokens ?? 0
  }
  return { inputTokens, outputTokens, totalTokens }
}
