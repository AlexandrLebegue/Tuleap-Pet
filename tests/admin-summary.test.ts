import { describe, expect, it } from 'vitest'
import { buildAdminSummaryMessages } from '../src/main/prompts/admin-summary'
import type { AdminScanResult } from '../src/shared/types'

const scan: AdminScanResult = {
  scannedAt: Date.parse('2026-05-08T10:00:00Z'),
  windowDays: 7,
  projectId: 101,
  projectLabel: 'Acme',
  totalArtifactsRecent: 17,
  trackers: [
    {
      trackerId: 1,
      trackerLabel: 'User Stories',
      itemName: 'user_story',
      total: 50,
      recent: 9,
      recentArtifacts: []
    },
    {
      trackerId: 2,
      trackerLabel: 'Bugs',
      itemName: 'bug',
      total: 120,
      recent: 8,
      recentArtifacts: []
    }
  ],
  openSprints: [
    {
      id: 42,
      label: 'Sprint 7',
      status: 'open',
      semanticStatus: 'open',
      startDate: '2026-05-01T00:00:00+00:00',
      endDate: '2026-05-15T00:00:00+00:00',
      uri: 'milestones/42',
      htmlUrl: null
    }
  ]
}

describe('buildAdminSummaryMessages', () => {
  it('returns a system + user pair', () => {
    const messages = buildAdminSummaryMessages(scan)
    expect(messages).toHaveLength(2)
    expect(messages[0]?.role).toBe('system')
    expect(messages[1]?.role).toBe('user')
  })

  it('interpolates project name, window and total recent', () => {
    const userMsg = buildAdminSummaryMessages(scan)[1]!.content
    expect(userMsg).toContain('Acme')
    expect(userMsg).toContain('7 derniers jours')
    expect(userMsg).toContain('17')
  })

  it('renders one bullet per tracker and per sprint', () => {
    const userMsg = buildAdminSummaryMessages(scan)[1]!.content
    expect(userMsg).toContain('User Stories : 9 récents / 50 items')
    expect(userMsg).toContain('Bugs : 8 récents / 120 items')
    expect(userMsg).toContain('Sprint 7 (2026-05-01 → 2026-05-15)')
  })

  it('handles a scan with no open sprints', () => {
    const userMsg = buildAdminSummaryMessages({ ...scan, openSprints: [] })[1]!.content
    expect(userMsg).toContain('aucun sprint ouvert')
  })

  it('handles a scan with no trackers', () => {
    const userMsg = buildAdminSummaryMessages({ ...scan, trackers: [] })[1]!.content
    expect(userMsg).toContain('(aucun tracker)')
  })
})
