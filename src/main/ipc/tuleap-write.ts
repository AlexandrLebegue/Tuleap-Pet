import { ipcMain } from 'electron'
import { applyWrite, type PendingWriteAction } from '../llm/write-tools'

export function registerTuleapWriteHandlers(): void {
  ipcMain.handle('tuleap:apply-write', async (_evt, action: PendingWriteAction) => {
    try {
      return await applyWrite(action)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false as const, error: message }
    }
  })
}
