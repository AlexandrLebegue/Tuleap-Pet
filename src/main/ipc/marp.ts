import { BrowserWindow, dialog, ipcMain } from 'electron'
import { exportMarpPptx, renderMarpPreview, type PptxExportResult } from '../marp'
import { audit } from '../store/db'

export type MarpExportRequest = {
  markdown: string
  suggestedName?: string
}

export type MarpExportResult =
  | { ok: true; outputPath: string }
  | { ok: false; cancelled: true }
  | { ok: false; error: string }

export function registerMarpHandlers(): void {
  ipcMain.handle('marp:render-preview', (_event, markdown: unknown): { html: string } => {
    if (typeof markdown !== 'string') {
      throw new Error('Markdown attendu en argument.')
    }
    const { html } = renderMarpPreview(markdown)
    return { html }
  })

  ipcMain.handle(
    'marp:export-pptx',
    async (event, request: unknown): Promise<MarpExportResult> => {
      if (
        !request ||
        typeof request !== 'object' ||
        typeof (request as MarpExportRequest).markdown !== 'string'
      ) {
        return { ok: false, error: 'Requête invalide.' }
      }
      const { markdown, suggestedName } = request as MarpExportRequest

      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const fallbackName = suggestedName?.replace(/[^A-Za-z0-9._-]+/g, '_') || 'sprint-review.pptx'
      const result = await dialog.showSaveDialog(win as BrowserWindow, {
        title: 'Exporter le sprint review',
        defaultPath: fallbackName,
        filters: [{ name: 'PowerPoint', extensions: ['pptx'] }]
      })
      if (result.canceled || !result.filePath) {
        return { ok: false, cancelled: true }
      }

      audit('marp.export-pptx', result.filePath, { length: markdown.length })
      try {
        const out: PptxExportResult = await exportMarpPptx(markdown, result.filePath)
        return { ok: true, outputPath: out.outputPath }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
}
