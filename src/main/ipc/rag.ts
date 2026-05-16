import { ipcMain, BrowserWindow } from 'electron'
import { indexClosedArtifacts, searchArtifacts, type RagSearchHit } from '../rag/indexer'
import { audit } from '../store/db'
import { getConfig } from '../store/config'

export function registerRagHandlers(): void {
  ipcMain.handle(
    'rag:index',
    async (evt): Promise<{ ok: true; indexed: number; skipped: number } | { ok: false; error: string }> => {
      try {
        const projectId = getConfig().projectId
        if (!projectId) return { ok: false, error: 'Aucun projet sélectionné.' }
        const senderId = BrowserWindow.fromWebContents(evt.sender)?.id ?? -1
        const result = await indexClosedArtifacts(projectId, {
          onProgress: (done, total) => {
            const win = senderId >= 0 ? BrowserWindow.fromId(senderId) : null
            if (win && !win.isDestroyed()) {
              win.webContents.send('rag:progress', { done, total })
            }
          }
        })
        audit('rag.index', String(projectId), result)
        return { ok: true, ...result }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(
    'rag:search',
    async (_evt, args: { query: string; limit?: number }): Promise<RagSearchHit[]> => {
      audit('rag.search', null, { q: args.query.slice(0, 80) })
      return searchArtifacts(args.query, args.limit ?? 8)
    }
  )
}
