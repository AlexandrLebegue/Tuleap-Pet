import { describe, expect, it } from 'vitest'
import { mapArtifactDetail, mapArtifactSummary, mapProject, mapTracker } from '../src/main/tuleap'

describe('mapProject', () => {
  it('keeps id, label, shortname, uri', () => {
    expect(mapProject({ id: 1, uri: 'projects/1', label: 'A', shortname: 'a' })).toEqual({
      id: 1,
      label: 'A',
      shortname: 'a',
      uri: 'projects/1'
    })
  })
})

describe('mapTracker', () => {
  it('forwards artifact count and falls back on missing fields', () => {
    expect(
      mapTracker(
        { id: 7, uri: 'trackers/7', label: 'Stories' } as Parameters<typeof mapTracker>[0],
        12
      )
    ).toEqual({
      id: 7,
      label: 'Stories',
      itemName: '',
      description: '',
      color: null,
      artifactCount: 12
    })
  })
})

describe('mapArtifactSummary', () => {
  it('reads submitted_by_user.real_name when available', () => {
    const out = mapArtifactSummary({
      id: 1,
      uri: 'artifacts/1',
      tracker: { id: 5 },
      submitted_by: 102,
      submitted_by_user: { username: 'alice', real_name: 'Alice Doe' }
    } as Parameters<typeof mapArtifactSummary>[0])
    expect(out.submittedBy).toBe('Alice Doe')
    expect(out.trackerId).toBe(5)
  })

  it('falls back on submitted_by id when no user object is present', () => {
    const out = mapArtifactSummary({
      id: 1,
      uri: 'artifacts/1',
      tracker: { id: 5 },
      submitted_by: 102
    } as Parameters<typeof mapArtifactSummary>[0])
    expect(out.submittedBy).toBe('102')
  })
})

describe('mapArtifactDetail', () => {
  it('extracts forward and reverse art_link entries', () => {
    const detail = mapArtifactDetail({
      id: 1,
      uri: 'artifacts/1',
      tracker: { id: 5 },
      values: [
        {
          field_id: 1,
          type: 'string',
          label: 'Description',
          value: 'Hello'
        },
        {
          field_id: 2,
          type: 'art_link',
          label: 'Links',
          links: [{ id: 10, uri: 'artifacts/10', type: '_is_child' }],
          reverse_links: [{ id: 5, uri: 'artifacts/5' }]
        }
      ]
    } as unknown as Parameters<typeof mapArtifactDetail>[0])
    expect(detail.description).toBe('Hello')
    expect(detail.links).toHaveLength(2)
    expect(detail.links).toContainEqual({
      id: 10,
      uri: 'artifacts/10',
      type: '_is_child',
      direction: 'forward'
    })
    expect(detail.links).toContainEqual({
      id: 5,
      uri: 'artifacts/5',
      type: null,
      direction: 'reverse'
    })
  })
})
