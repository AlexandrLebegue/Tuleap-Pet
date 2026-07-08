import type {
  ArtifactDetail,
  ArtifactFieldValue,
  ArtifactLink,
  ArtifactReference,
  ArtifactSummary,
  GitCommit,
  MilestoneSummary,
  ProjectSummary,
  TrackerFields,
  TrackerSummary
} from '@shared/types'
import type {
  ArtifactDetailRaw,
  ArtifactFieldValueRaw,
  ArtifactSummaryRaw,
  GitCommitRaw,
  MilestoneContentItemRaw,
  MilestoneRaw,
  ProjectRaw,
  TrackerRaw,
  TrackerStructureRaw
} from './schemas'

export function mapProject(raw: ProjectRaw): ProjectSummary {
  return { id: raw.id, label: raw.label, shortname: raw.shortname, uri: raw.uri }
}

export function mapTracker(raw: TrackerRaw, artifactCount: number | null = null): TrackerSummary {
  return {
    id: raw.id,
    label: raw.label,
    itemName: raw.item_name ?? '',
    description: raw.description ?? '',
    color: raw.color_name ?? null,
    artifactCount
  }
}

function rawToFieldValue(raw: ArtifactFieldValueRaw): ArtifactFieldValue {
  const { field_id, label, type, ...rest } = raw
  return { fieldId: field_id, label, type, value: rest }
}

function rawSubmittedBy(raw: ArtifactSummaryRaw | ArtifactDetailRaw): string | null {
  const user = raw.submitted_by_user
  if (user) {
    const name = (user.real_name ?? '').trim() || (user.username ?? '').trim()
    if (name) return name
  }
  if (raw.submitted_by !== undefined && raw.submitted_by !== null) {
    return String(raw.submitted_by)
  }
  return null
}

export function mapArtifactSummary(raw: ArtifactSummaryRaw): ArtifactSummary {
  return {
    id: raw.id,
    title: raw.title ?? '',
    status: raw.status ?? null,
    uri: raw.uri,
    htmlUrl: raw.html_url ?? null,
    submittedBy: rawSubmittedBy(raw),
    submittedOn: raw.submitted_on ?? null,
    lastModified: raw.last_modified_date ?? null,
    trackerId: raw.tracker.id
  }
}

/**
 * Maps a milestone content item (backlog item) to ArtifactSummary.
 * Handles the case where uri/tracker may be absent or nested inside an `artifact` wrapper.
 */
export function mapMilestoneContentItem(raw: MilestoneContentItemRaw): ArtifactSummary {
  // Some Tuleap versions wrap the artifact data inside an `artifact` property
  const nested = raw.artifact
  const uri = raw.uri || nested?.uri || ''
  const trackerId = raw.tracker?.id ?? nested?.tracker?.id ?? 0
  const title = raw.title ?? (raw as unknown as { label?: string }).label ?? ''

  return {
    id: raw.id,
    title,
    status: raw.status ?? null,
    uri,
    htmlUrl: raw.html_url ?? null,
    submittedBy: rawSubmittedBy(raw as unknown as ArtifactSummaryRaw),
    submittedOn: raw.submitted_on ?? null,
    lastModified: raw.last_modified_date ?? null,
    trackerId
  }
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const DESCRIPTION_LABELS = new Set([
  'description',
  'details',
  'détails',
  'résumé',
  'resume',
  'description détaillée',
  'description detaillee',
  'original submission',
  'user story'
])

function extractDescription(values: ArtifactFieldValueRaw[]): string | null {
  for (const value of values) {
    const label = (value.label ?? '').toLowerCase()
    if (DESCRIPTION_LABELS.has(label)) {
      const raw = value as unknown as Record<string, unknown>
      // values_format=collection: { value: "text" }
      if (typeof raw['value'] === 'string' && raw['value'].length > 0) {
        return stripHtml(raw['value'])
      }
    }
  }
  // Fallback : les trackers personnalisés nomment souvent la description
  // autrement — on prend le champ texte le plus long (hors labels connus).
  let best: string | null = null
  for (const value of values) {
    if (value.type !== 'text') continue
    const raw = value as unknown as Record<string, unknown>
    if (typeof raw['value'] === 'string') {
      const text = stripHtml(raw['value'])
      if (text.length > 30 && (best === null || text.length > best.length)) best = text
    }
  }
  return best
}

/**
 * Extrait les références croisées du champ « Cross References » (type `cross`).
 * Selon la version de Tuleap, `value` est un array direct de refs, ou un objet
 * `{ references: [...] }` ; chaque ref porte `ref`/`reference`, `url`/`link`
 * et parfois `direction` ('in' | 'out'). C'est là que remontent les pull
 * requests (`pr #12`), commits (`git #repo/sha`) et artefacts liés.
 */
function extractCrossReferences(values: ArtifactFieldValueRaw[]): ArtifactReference[] {
  const out: ArtifactReference[] = []
  for (const value of values) {
    const label = (value.label ?? '').toLowerCase()
    if (
      value.type !== 'cross' &&
      !label.includes('cross reference') &&
      label !== 'references' &&
      label !== 'références'
    ) {
      continue
    }
    const raw = value as unknown as Record<string, unknown>
    const inner = raw['value'] as Record<string, unknown> | unknown[] | null | undefined
    const candidates: unknown[] = Array.isArray(inner)
      ? inner
      : inner && Array.isArray((inner as Record<string, unknown>)['references'])
        ? ((inner as Record<string, unknown>)['references'] as unknown[])
        : Array.isArray(raw['references'])
          ? (raw['references'] as unknown[])
          : []
    for (const c of candidates) {
      if (!c || typeof c !== 'object') continue
      const obj = c as Record<string, unknown>
      const ref = String(obj['ref'] ?? obj['reference'] ?? '').trim()
      if (!ref) continue
      const url =
        typeof obj['url'] === 'string'
          ? obj['url']
          : typeof obj['link'] === 'string'
            ? obj['link']
            : null
      const dir = obj['direction']
      out.push({ ref, url, direction: dir === 'in' || dir === 'out' ? dir : null })
    }
  }
  return out
}

function extractLinks(values: ArtifactFieldValueRaw[]): ArtifactLink[] {
  const out: ArtifactLink[] = []
  for (const value of values) {
    if (value.type !== 'art_link') continue
    const linksRaw = (value as unknown as { links?: unknown }).links
    if (Array.isArray(linksRaw)) {
      for (const link of linksRaw) {
        if (link && typeof link === 'object' && 'id' in link) {
          const l = link as { id: number; uri?: string; type?: string | null }
          out.push({
            id: l.id,
            uri: l.uri ?? '',
            type: l.type ?? null,
            direction: 'forward'
          })
        }
      }
    }
    const reverseRaw = (value as unknown as { reverse_links?: unknown }).reverse_links
    if (Array.isArray(reverseRaw)) {
      for (const link of reverseRaw) {
        if (link && typeof link === 'object' && 'id' in link) {
          const l = link as { id: number; uri?: string; type?: string | null }
          out.push({
            id: l.id,
            uri: l.uri ?? '',
            type: l.type ?? null,
            direction: 'reverse'
          })
        }
      }
    }
  }
  return out
}

export function mapArtifactDetail(raw: ArtifactDetailRaw): ArtifactDetail {
  const values = raw.values ?? []
  const summary = mapArtifactSummary(raw)
  return {
    ...summary,
    description: extractDescription(values),
    values: values.map(rawToFieldValue),
    links: extractLinks(values),
    crossReferences: extractCrossReferences(values)
  }
}

export function mapGitCommit(raw: GitCommitRaw): GitCommit {
  return {
    id: raw.id,
    shortId: raw.short_id ?? raw.id.slice(0, 7),
    title: raw.title,
    authorName: raw.author_name,
    authoredDate: raw.authored_date
  }
}

export function mapTrackerFields(raw: TrackerStructureRaw): TrackerFields {
  const titleFieldId = raw.semantics?.title?.field_id ?? null
  const descriptionFieldId = raw.semantics?.description?.field_id ?? null
  const statusFieldId = raw.semantics?.status?.field_id ?? null
  const statusFieldRaw =
    statusFieldId !== null ? (raw.fields.find((f) => f.field_id === statusFieldId) ?? null) : null
  return {
    trackerId: raw.id,
    titleFieldId,
    descriptionFieldId,
    statusFieldId,
    statusField: statusFieldRaw
      ? {
          fieldId: statusFieldRaw.field_id,
          label: statusFieldRaw.label,
          type: statusFieldRaw.type,
          bindValues: statusFieldRaw.values.map((v) => ({ id: v.id, label: v.label }))
        }
      : null
  }
}

function normalizeMilestoneStatus(value: string | null | undefined): 'open' | 'closed' | null {
  if (!value) return null
  const lower = value.toLowerCase()
  if (lower === 'open') return 'open'
  if (lower === 'closed') return 'closed'
  return null
}

export function mapMilestone(raw: MilestoneRaw): MilestoneSummary {
  return {
    id: raw.id,
    label: raw.label,
    status: normalizeMilestoneStatus(raw.status ?? null),
    semanticStatus: normalizeMilestoneStatus(raw.semantic_status ?? null),
    startDate: raw.start_date ?? null,
    endDate: raw.end_date ?? null,
    uri: raw.uri,
    htmlUrl: raw.html_url ?? null
  }
}
