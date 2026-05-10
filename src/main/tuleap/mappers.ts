import type {
  ArtifactDetail,
  ArtifactFieldValue,
  ArtifactLink,
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
    // Prefer real_name; fall back to username; ignore empty strings
    const name = (user.real_name ?? '').trim() || (user.username ?? '').trim()
    return name || null
  }
  // submitted_by is a numeric user ID — useless without a name
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
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractDescription(values: ArtifactFieldValueRaw[]): string | null {
  for (const value of values) {
    const label = (value.label ?? '').toLowerCase()
    if (label === 'description' || label === 'details' || label === 'résumé' || label === 'resume') {
      const raw = value as unknown as Record<string, unknown>
      // values_format=collection: { value: "text" }
      if (typeof raw['value'] === 'string' && raw['value'].length > 0) {
        return stripHtml(raw['value'])
      }
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
