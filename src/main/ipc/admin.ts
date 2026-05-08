import { ipcMain } from 'electron'
import { audit } from '../store/db'
import { scanRecentActivity } from '../admin/scanner'
import { buildAdminSummaryMessages } from '../prompts'
import { resolveLlmProvider, toLlmError } from '../llm'
import type { AdminScanResult } from '@shared/types'

export type AdminSummaryResult =
  | { ok: true; markdown: string; model: string; usage: { totalTokens?: number } | null }
  | { ok: false; error: string; kind: string }

export function registerAdminHandlers(): void {
  ipcMain.handle('admin:scan', async (_event, args: unknown): Promise<AdminScanResult> => {
    const opts = (args ?? {}) as { windowDays?: number }
    const windowDays = typeof opts.windowDays === 'number' ? opts.windowDays : 7
    audit('admin.scan', String(windowDays))
    return scanRecentActivity({ windowDays })
  })

  ipcMain.handle(
    'admin:summarize',
    async (_event, scan: unknown): Promise<AdminSummaryResult> => {
      if (!scan || typeof scan !== 'object') {
        return { ok: false, error: 'Scan invalide.', kind: 'unknown' }
      }
      audit('admin.summarize')
      try {
        const provider = resolveLlmProvider()
        const messages = buildAdminSummaryMessages(scan as AdminScanResult)
        const result = await provider.generate({
          messages,
          temperature: 0.2,
          maxOutputTokens: 600
        })
        return {
          ok: true,
          markdown: result.text,
          model: result.model,
          usage: result.usage ? { totalTokens: result.usage.totalTokens } : null
        }
      } catch (err) {
        const e = toLlmError(err)
        return { ok: false, error: e.message, kind: e.kind }
      }
    }
  )
}
