import { describe, expect, it } from 'vitest'
import { formatArtifactContext } from '../src/main/coder/context'
import type { ArtifactDetail } from '../src/shared/types'

const baseArtifact: ArtifactDetail = {
  id: 4242,
  title: 'Add login button',
  status: 'In progress',
  uri: 'artifacts/4242',
  htmlUrl: 'https://tuleap.example.com/plugins/tracker/?aid=4242',
  submittedBy: 'Alice Doe',
  submittedOn: '2026-04-15T10:00:00+00:00',
  lastModified: '2026-04-22T09:00:00+00:00',
  trackerId: 1,
  description: 'Add a login button on the home page header.',
  values: [
    { fieldId: 1, label: 'Title', type: 'string', value: { value: 'Add login button' } },
    { fieldId: 2, label: 'Story Points', type: 'int', value: { value: 5 } },
    { fieldId: 3, label: 'Assigned To', type: 'sb', value: { values: [{ id: 102, label: 'Alice' }] } },
    { fieldId: 4, label: 'Description', type: 'text', value: { value: 'will be skipped' } }
  ],
  links: [
    { id: 1235, uri: 'artifacts/1235', type: '_is_child', direction: 'forward' },
    { id: 999, uri: 'artifacts/999', type: null, direction: 'reverse' }
  ]
}

describe('formatArtifactContext', () => {
  it('starts with a markdown title that includes the artifact id', () => {
    const md = formatArtifactContext(baseArtifact)
    expect(md.split('\n')[0]).toBe('# Ticket Tuleap #4242 — Add login button')
  })

  it('emits a metadata block with status, submitter and html_url', () => {
    const md = formatArtifactContext(baseArtifact)
    expect(md).toContain('- Statut : In progress')
    expect(md).toContain('- Soumis par : Alice Doe')
    expect(md).toContain('- URL : https://tuleap.example.com/plugins/tracker/?aid=4242')
  })

  it('includes the description as its own section', () => {
    const md = formatArtifactContext(baseArtifact)
    expect(md).toContain('## Description')
    expect(md).toContain('Add a login button on the home page header.')
  })

  it('renders simple field values and skips Description / Links by label', () => {
    const md = formatArtifactContext(baseArtifact)
    expect(md).toContain('## Champs')
    expect(md).toContain('**Title**')
    expect(md).toContain('**Story Points**')
    // Description section is rendered separately; the field with label
    // 'Description' must NOT reappear under '## Champs' to avoid duplication.
    expect(md).not.toContain('**Description**')
  })

  it('lists forward and reverse links with arrows and types', () => {
    const md = formatArtifactContext(baseArtifact)
    expect(md).toContain('## Liens')
    expect(md).toContain('→ enfant #1235 (_is_child)')
    expect(md).toContain('← parent #999')
  })

  it('falls back gracefully when description and values are missing', () => {
    const md = formatArtifactContext({
      ...baseArtifact,
      description: null,
      values: [],
      links: []
    })
    expect(md).not.toContain('## Description')
    expect(md).not.toContain('## Champs')
    expect(md).not.toContain('## Liens')
  })

  it('truncates long string field values past 600 chars', () => {
    const long = 'x'.repeat(800)
    const md = formatArtifactContext({
      ...baseArtifact,
      description: null,
      values: [{ fieldId: 5, label: 'Notes', type: 'text', value: { value: long } }],
      links: []
    })
    expect(md).toContain('**Notes**')
    expect(md).toContain('…')
    expect(md).not.toContain(long)
  })
})
