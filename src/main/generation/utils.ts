import type { ArtifactDetail, ArtifactSummary } from '@shared/types'

export function stripFences(text: string): string {
  return text.replace(/^```(?:\w+)?\n([\s\S]*?)\n```\s*$/m, '$1').trim()
}

export function detectUnmatchedPlaceholders(text: string): string[] {
  const matches = text.match(/\{[A-Z][A-Z0-9_]+\}/g)
  return matches ?? []
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
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

export function formatArtifactBlock(
  artifacts: ArtifactDetail[],
  childIds?: Set<number>
): string {
  if (artifacts.length === 0) return '_Aucun artefact détaillé disponible._'
  return artifacts
    .map((a) => {
      const isChild = childIds?.has(a.id) ?? false
      const prefix = isChild ? '  ↳ ' : ''
      const heading = isChild
        ? `#### ${prefix}#${a.id} — ${a.title || '(sans titre)'} _(sous-tâche)_`
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
          const val = resolveFieldValue(field.value)
          if (val && val.length > 0) {
            lines.push(`- **${field.label} :** ${val.slice(0, 150)}`)
            shown++
          }
        }
      }
      return lines.join('\n')
    })
    .join('\n\n')
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
