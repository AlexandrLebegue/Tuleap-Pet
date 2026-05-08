import type { ArtifactDetail } from '@shared/types'
import { buildTuleapClient, mapArtifactDetail } from '../tuleap'

/**
 * Build a Markdown context block from a Tuleap artifact, ready to be
 * injected as a user prompt to OpenCode (or copied to the clipboard).
 *
 * Goal: be exhaustive enough for the model to reason about the ticket
 * without exfiltrating sensitive data — we only quote fields that have a
 * value and skip the raw permissions / users metadata.
 */
export function formatArtifactContext(detail: ArtifactDetail): string {
  const lines: string[] = []
  lines.push(`# Ticket Tuleap #${detail.id} — ${detail.title || '(sans titre)'}`)
  lines.push('')
  if (detail.status) lines.push(`- Statut : ${detail.status}`)
  if (detail.submittedBy) lines.push(`- Soumis par : ${detail.submittedBy}`)
  if (detail.submittedOn) lines.push(`- Soumis le : ${detail.submittedOn.slice(0, 10)}`)
  if (detail.lastModified)
    lines.push(`- Dernière modification : ${detail.lastModified.slice(0, 10)}`)
  if (detail.htmlUrl) lines.push(`- URL : ${detail.htmlUrl}`)
  lines.push('')

  if (detail.description && detail.description.trim().length > 0) {
    lines.push('## Description')
    lines.push('')
    lines.push(detail.description.trim())
    lines.push('')
  }

  const valuesByLabel = detail.values.filter((v) => {
    const lower = (v.label || '').toLowerCase()
    return lower !== 'description' && lower !== 'details' && lower !== 'links' && lower !== 'liens'
  })
  if (valuesByLabel.length > 0) {
    lines.push('## Champs')
    for (const v of valuesByLabel) {
      const renderedValue = renderFieldValue(v.type, (v as unknown as { value?: unknown }).value)
      if (renderedValue !== null) {
        lines.push(`- **${v.label || `field_${v.fieldId}`}** : ${renderedValue}`)
      }
    }
    lines.push('')
  }

  if (detail.links.length > 0) {
    lines.push('## Liens')
    for (const link of detail.links) {
      const arrow = link.direction === 'forward' ? '→ enfant' : '← parent'
      lines.push(`- ${arrow} #${link.id}${link.type ? ` (${link.type})` : ''}`)
    }
    lines.push('')
  }

  return lines.join('\n').trim() + '\n'
}

function renderFieldValue(type: string, value: unknown): string | null {
  void type
  // The mapper wraps every field's payload into { value, values, links, ... }
  // — unwrap the most common shapes before recursing.
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    if ('value' in obj) return renderFieldValue(type, obj['value'])
    if (Array.isArray(obj['values'])) {
      const arr = obj['values'] as unknown[]
      const labels = arr
        .map((v) => {
          if (v && typeof v === 'object' && 'label' in v) {
            return String((v as { label?: unknown }).label ?? '')
          }
          return typeof v === 'string' || typeof v === 'number' ? String(v) : ''
        })
        .filter((s) => s.length > 0)
      if (labels.length === 0) return null
      return labels.slice(0, 6).join(', ')
    }
  }
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length === 0) return null
    return trimmed.length > 600 ? trimmed.slice(0, 600) + '…' : trimmed
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return null
    return value
      .map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v)))
      .slice(0, 6)
      .join(', ')
  }
  if (typeof value === 'object') {
    const json = JSON.stringify(value)
    if (json.length > 400) return null
    return json
  }
  return null
}

export async function buildArtifactContext(
  artifactId: number
): Promise<{ artifact: ArtifactDetail; contextMarkdown: string }> {
  const client = await buildTuleapClient()
  const raw = await client.getArtifact(artifactId)
  const artifact = mapArtifactDetail(raw)
  return { artifact, contextMarkdown: formatArtifactContext(artifact) }
}
