import type {
  ArtifactDetail,
  ArtifactFieldValue,
  ArtifactLink,
  ArtifactSummary,
  MilestoneSummary,
  ProjectSummary,
  TrackerSummary
} from '@shared/types'
import type {
  ArtifactDetailRaw,
  ArtifactFieldValueRaw,
  ArtifactSummaryRaw,
  MilestoneRaw,
  ProjectRaw,
  TrackerRaw
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
    return user.real_name ?? user.username ?? null
  }
  return raw.submitted_by !== undefined && raw.submitted_by !== null ? String(raw.submitted_by) : null
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

function extractDescription(values: ArtifactFieldValueRaw[]): string | null {
  for (const value of values) {
    const label = (value.label ?? '').toLowerCase()
    if (label === 'description' || label === 'details') {
      const v = (value as unknown as { value?: unknown }).value
      if (typeof v === 'string' && v.length > 0) return v
    }
  }
  return null
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
    links: extractLinks(values)
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
