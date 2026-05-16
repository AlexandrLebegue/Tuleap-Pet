import { ipcMain } from 'electron'
import {
  buildTuleapClient,
  mapArtifactSummary,
  mapMilestone,
  mapMilestoneContentItem
} from '../tuleap'
import { audit } from '../store/db'
import { getConfig } from '../store/config'
import type { ArtifactSummary, MilestoneSummary } from '@shared/types'

type SprintBoardData = {
  sprint: MilestoneSummary | null
  sprintItems: ArtifactSummary[]
  backlogItems: ArtifactSummary[]
  workflow: string[]
}

export function registerSprintBoardHandlers(): void {
  ipcMain.handle('sprint:list-open', async () => {
    const id = getConfig().projectId
    if (!id) return [] as MilestoneSummary[]
    const client = await buildTuleapClient()
    const page = await client.listMilestones(id, { status: 'open', limit: 50 })
    audit('sprint.list', String(id))
    return page.items.map(mapMilestone)
  })

  ipcMain.handle(
    'sprint:get-board',
    async (_evt, args: { milestoneId: number | null }): Promise<SprintBoardData> => {
      const projectId = getConfig().projectId
      if (!projectId) return { sprint: null, sprintItems: [], backlogItems: [], workflow: [] }
      const client = await buildTuleapClient()

      let sprint: MilestoneSummary | null = null
      let sprintItems: ArtifactSummary[] = []
      if (args.milestoneId) {
        const raw = await client.getMilestone(args.milestoneId)
        sprint = mapMilestone(raw)
        const content = await client.listMilestoneContent(args.milestoneId, { limit: 200 })
        sprintItems = content.items.map(mapMilestoneContentItem)
      }

      const trackers = await client.listTrackers(projectId, { limit: 50 })
      const backlogItems: ArtifactSummary[] = []
      const seenIds = new Set(sprintItems.map((it) => it.id))
      for (const tracker of trackers.items.slice(0, 6)) {
        try {
          const page = await client.listArtifacts(tracker.id, { limit: 30, offset: 0 })
          for (const raw of page.items) {
            const item = mapArtifactSummary(raw)
            if (seenIds.has(item.id)) continue
            const status = (item.status ?? '').toLowerCase()
            if (status === 'done' || status === 'closed' || status === 'fermé') continue
            backlogItems.push(item)
          }
        } catch {
          // skip trackers we cannot read
        }
      }

      const workflow = Array.from(
        new Set(
          [...sprintItems, ...backlogItems]
            .map((it) => it.status)
            .filter((s): s is string => typeof s === 'string' && s.length > 0)
        )
      )
      const defaultColumns = ['To do', 'In progress', 'Review', 'Done']
      const merged = workflow.length > 0 ? workflow : defaultColumns

      audit('sprint.get-board', String(args.milestoneId ?? 'none'), {
        sprintItems: sprintItems.length,
        backlogItems: backlogItems.length
      })

      return { sprint, sprintItems, backlogItems, workflow: merged }
    }
  )

  ipcMain.handle(
    'sprint:scan-risks',
    async (
      _evt,
      args: { items: ArtifactSummary[] }
    ): Promise<{ ok: true; risks: Array<{ id: number; level: 'low' | 'medium' | 'high'; reason: string }> }> => {
      const now = Date.now()
      const risks: Array<{ id: number; level: 'low' | 'medium' | 'high'; reason: string }> = []
      for (const item of args.items) {
        if (!item.lastModified) continue
        const ageDays = (now - Date.parse(item.lastModified)) / (24 * 3600 * 1000)
        const status = (item.status ?? '').toLowerCase()
        if (status.includes('review') && ageDays > 3) {
          risks.push({
            id: item.id,
            level: ageDays > 7 ? 'high' : 'medium',
            reason: `En review depuis ${Math.round(ageDays)}j`
          })
        } else if (status.includes('progress') && ageDays > 10) {
          risks.push({
            id: item.id,
            level: 'medium',
            reason: `In progress depuis ${Math.round(ageDays)}j sans update`
          })
        } else if (!item.title || item.title.length < 8) {
          risks.push({ id: item.id, level: 'low', reason: 'Titre trop court / vide' })
        }
      }
      audit('sprint.scan-risks', null, { found: risks.length })
      return { ok: true, risks }
    }
  )
}
