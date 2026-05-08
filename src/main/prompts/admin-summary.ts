import type { AdminScanResult } from '@shared/types'
import { getPrompt, interpolate } from './loader'
import type { LlmMessage } from '../llm'

function formatTrackerLines(scan: AdminScanResult): string {
  if (scan.trackers.length === 0) return '_(aucun tracker)_'
  return scan.trackers
    .slice(0, 12)
    .map((t) => `- ${t.trackerLabel} : ${t.recent} récents / ${t.total} items`)
    .join('\n')
}

function formatSprintLines(scan: AdminScanResult): string {
  if (scan.openSprints.length === 0) return '_aucun sprint ouvert_'
  return scan.openSprints
    .slice(0, 8)
    .map((m) => {
      const dates = [m.startDate?.slice(0, 10), m.endDate?.slice(0, 10)]
        .filter(Boolean)
        .join(' → ')
      return `- ${m.label}${dates ? ` (${dates})` : ''}`
    })
    .join('\n')
}

export function buildAdminSummaryMessages(scan: AdminScanResult): LlmMessage[] {
  const tpl = getPrompt('admin_summary')
  const vars: Record<string, string | number> = {
    project_name: scan.projectLabel,
    window_days: scan.windowDays,
    scanned_at: new Date(scan.scannedAt).toLocaleDateString(),
    total_recent: scan.totalArtifactsRecent,
    tracker_lines: formatTrackerLines(scan),
    sprint_lines: formatSprintLines(scan)
  }
  const userMessage = interpolate(tpl.userTemplate, vars)
  return [
    { role: 'system', content: tpl.system },
    { role: 'user', content: userMessage }
  ]
}
