import { describe, expect, it } from 'vitest'
import { interpolate } from '../src/main/prompts/loader'
import { bucketArtifacts, buildSprintReviewMessages } from '../src/main/prompts/sprint-review'
import type { ArtifactSummary, MilestoneSummary } from '../src/shared/types'

function artifact(partial: Partial<ArtifactSummary> & { id: number }): ArtifactSummary {
  return {
    id: partial.id,
    title: partial.title ?? `Item ${partial.id}`,
    status: partial.status ?? null,
    uri: partial.uri ?? `artifacts/${partial.id}`,
    htmlUrl: null,
    submittedBy: partial.submittedBy ?? null,
    submittedOn: null,
    lastModified: null,
    trackerId: 1
  }
}

const milestone: MilestoneSummary = {
  id: 42,
  label: 'Sprint 7',
  status: 'open',
  semanticStatus: 'open',
  startDate: '2026-04-15T00:00:00+00:00',
  endDate: '2026-04-29T00:00:00+00:00',
  uri: 'milestones/42',
  htmlUrl: null
}

describe('interpolate', () => {
  it('replaces {{var}} with the matching string', () => {
    expect(interpolate('Hello {{name}}!', { name: 'Alice' })).toBe('Hello Alice!')
  })

  it('keeps the placeholder when the variable is missing', () => {
    expect(interpolate('A {{missing}} placeholder', {})).toBe('A {{missing}} placeholder')
  })

  it('coerces numbers to strings', () => {
    expect(interpolate('Count: {{n}}', { n: 7 })).toBe('Count: 7')
  })

  it('tolerates whitespace inside the braces', () => {
    expect(interpolate('Hi {{  name  }}.', { name: 'Bob' })).toBe('Hi Bob.')
  })
})

describe('bucketArtifacts', () => {
  it('maps closed / done / fermé to done bucket (case insensitive)', () => {
    const out = bucketArtifacts([
      artifact({ id: 1, status: 'Done' }),
      artifact({ id: 2, status: 'CLOSED' }),
      artifact({ id: 3, status: 'fermé' }),
      artifact({ id: 4, status: 'Resolved' })
    ])
    expect(out.done.map((a) => a.id)).toEqual([1, 2, 3, 4])
    expect(out.inProgress).toHaveLength(0)
    expect(out.todo).toHaveLength(0)
  })

  it('maps in progress / WIP / review to in-progress bucket', () => {
    const out = bucketArtifacts([
      artifact({ id: 1, status: 'In progress' }),
      artifact({ id: 2, status: 'WIP' }),
      artifact({ id: 3, status: 'Review' })
    ])
    expect(out.inProgress.map((a) => a.id)).toEqual([1, 2, 3])
  })

  it('falls back to todo when status is null or unknown', () => {
    const out = bucketArtifacts([
      artifact({ id: 1, status: null }),
      artifact({ id: 2, status: 'New' })
    ])
    expect(out.todo.map((a) => a.id)).toEqual([1, 2])
  })
})

describe('buildSprintReviewMessages', () => {
  it('returns a system + user message and interpolates project / sprint metadata', () => {
    const messages = buildSprintReviewMessages({
      projectName: 'Acme',
      milestone,
      artifacts: [
        artifact({ id: 1, status: 'Done', title: 'Login' }),
        artifact({ id: 2, status: 'In progress', title: 'Search' }),
        artifact({ id: 3, status: 'Todo', title: 'Logout' })
      ]
    })
    expect(messages).toHaveLength(2)
    expect(messages[0]?.role).toBe('system')
    expect(messages[1]?.role).toBe('user')

    const userText = messages[1]!.content
    expect(userText).toContain('Acme')
    expect(userText).toContain('Sprint 7')
    expect(userText).toContain('2026-04-15')
    expect(userText).toContain('2026-04-29')
    expect(userText).toContain('Total d\'items : 3')
    expect(userText).toContain('Terminés : 1')
    expect(userText).toContain('En cours : 1')
    expect(userText).toContain('À faire : 1')
    expect(userText).toContain('#1 [Done] Login')
  })

  it('falls back to "inconnue" when start_date / end_date are null', () => {
    const messages = buildSprintReviewMessages({
      projectName: 'Acme',
      milestone: { ...milestone, startDate: null, endDate: null },
      artifacts: []
    })
    expect(messages[1]!.content).toContain('inconnue')
  })

  it('honours the language flag', () => {
    const fr = buildSprintReviewMessages({ projectName: 'A', milestone, artifacts: [], language: 'fr' })
    const en = buildSprintReviewMessages({ projectName: 'A', milestone, artifacts: [], language: 'en' })
    expect(fr[1]!.content).toContain('Génère un sprint review en fr')
    expect(en[1]!.content).toContain('Génère un sprint review en en')
  })
})
