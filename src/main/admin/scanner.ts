import {
  buildTuleapClient,
  mapArtifactSummary,
  mapMilestone,
  mapTracker
} from '../tuleap'
import { getConfig } from '../store/config'
import type { AdminScanResult, AdminTrackerActivity } from '@shared/types'

const RECENT_LIMIT_PER_TRACKER = 25
const RECENT_PRESERVE = 6

function withinDays(iso: string | null, days: number): boolean {
  if (!iso) return false
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return false
  return Date.now() - ts <= days * 86_400_000
}

/**
 * Walk every tracker of the configured project, keep the items modified
 * within the configured window, and merge the result into a single
 * AdminScanResult. Tracker fetches run in parallel; we cap each tracker's
 * artifact pull at 25 items to keep the scan responsive on large projects.
 *
 * Limitations (see backlog):
 *   - We don't paginate further than the first 25 items per tracker, so
 *     extremely active trackers may underreport the recent count.
 *   - Filtering is client-side because Tuleap's tracker query DSL doesn't
 *     guarantee a 'last_modified_date' field on every tracker.
 */
export async function scanRecentActivity(opts: {
  windowDays: number
}): Promise<AdminScanResult> {
  const config = getConfig()
  if (typeof config.projectId !== 'number') {
    throw new Error("Aucun projet n'est sélectionné.")
  }
  const days = Math.max(1, Math.min(opts.windowDays, 90))

  const client = await buildTuleapClient()
  const project = await client.getProject(config.projectId)
  const trackers = await client.listTrackers(config.projectId, { limit: 100 })
  const milestonesPage = await client.listMilestones(config.projectId, {
    status: 'open',
    limit: 50
  })

  const activities: AdminTrackerActivity[] = await Promise.all(
    trackers.items.map(async (rawTracker) => {
      try {
        const page = await client.listArtifacts(rawTracker.id, {
          limit: RECENT_LIMIT_PER_TRACKER,
          offset: 0
        })
        const artifacts = page.items.map(mapArtifactSummary)
        const recent = artifacts.filter((a) => withinDays(a.lastModified, days))
        const tracker = mapTracker(rawTracker, page.total)
        return {
          trackerId: tracker.id,
          trackerLabel: tracker.label,
          itemName: tracker.itemName,
          total: page.total,
          recent: recent.length,
          recentArtifacts: recent.slice(0, RECENT_PRESERVE)
        }
      } catch {
        const tracker = mapTracker(rawTracker, null)
        return {
          trackerId: tracker.id,
          trackerLabel: tracker.label,
          itemName: tracker.itemName,
          total: 0,
          recent: 0,
          recentArtifacts: []
        }
      }
    })
  )

  const totalRecent = activities.reduce((s, a) => s + a.recent, 0)

  return {
    scannedAt: Date.now(),
    windowDays: days,
    projectId: project.id,
    projectLabel: project.label,
    totalArtifactsRecent: totalRecent,
    trackers: activities.sort((a, b) => b.recent - a.recent),
    openSprints: milestonesPage.items.map(mapMilestone)
  }
}
