import { ipcMain } from 'electron'
import { buildJenkinsClient, JenkinsError } from '../jenkins'
import { buildTuleapClient, TuleapError } from '../tuleap'
import { exportBuildToTtm } from '../jenkins-ttm'
import { getConfig, getTtmTrackerId, setTtmTrackerId } from '../store/config'
import { audit } from '../store/db'
import type { JenkinsTtmExportProgress, JenkinsTtmExportResult } from '@shared/types'

type ExportResult =
  | ({ ok: true } & JenkinsTtmExportResult)
  | { ok: false; error: string; kind: string }

export function registerJenkinsTtmHandlers(): void {
  ipcMain.handle('jenkins-ttm:export', async (event, args: unknown): Promise<ExportResult> => {
    const { jobName, buildNumber, branchName, buildUrl } = args as {
      jobName: string
      buildNumber: number
      branchName: string
      buildUrl: string
    }
    audit('jenkins-ttm.export', `${jobName}#${buildNumber}`)

    const { projectId } = getConfig()
    if (!projectId) {
      return { ok: false, error: 'Aucun projet Tuleap configuré dans les Paramètres.', kind: 'config' }
    }

    try {
      const jenkins = buildJenkinsClient()
      const tuleap = await buildTuleapClient()
      const ttmTrackerId = getTtmTrackerId()

      const result = await exportBuildToTtm(
        { jobName, buildNumber, branchName, projectId, buildUrl },
        jenkins,
        tuleap,
        ttmTrackerId,
        (progress: JenkinsTtmExportProgress) => {
          event.sender.send('jenkins-ttm:progress', progress)
        }
      )
      return { ok: true, ...result }
    } catch (err) {
      if (err instanceof JenkinsError) {
        return { ok: false, error: err.message, kind: err.kind }
      }
      if (err instanceof TuleapError) {
        return { ok: false, error: err.message, kind: err.kind }
      }
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, error: message, kind: 'unknown' }
    }
  })

  ipcMain.handle('settings:set-ttm-tracker-id', (_event, id: unknown) => {
    if (id !== null && (typeof id !== 'number' || !Number.isInteger(id) || id <= 0)) {
      throw new Error("Le paramètre 'id' doit être un entier positif ou null.")
    }
    setTtmTrackerId(id as number | null)
    audit('settings.set-ttm-tracker-id', id === null ? null : String(id))
    return { ttmTrackerId: getTtmTrackerId() }
  })
}
