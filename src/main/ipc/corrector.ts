import { dialog } from 'electron'
import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { analyzeErrors, correctMultipleFiles } from '../corrector/corrector'
import { audit } from '../store/db'
import { debugError } from '../logger'

export function registerCorrectorHandlers(): void {
  ipcMain.handle('corrector:analyze', async (_event, args: unknown) => {
    const { errorContent } = args as { errorContent: string }
    audit('corrector.analyze')
    try {
      const analysis = await analyzeErrors(errorContent)
      return { analysis }
    } catch (err) {
      debugError('[corrector] analyze error: %s', err instanceof Error ? err.message : String(err))
      throw err
    }
  })

  ipcMain.handle('corrector:correct', async (_event, args: unknown) => {
    const { files, errorContent, analysis } = args as {
      files: { name: string; content: string }[]
      errorContent: string
      analysis: string
    }
    audit('corrector.correct', null, { fileCount: files.length })
    try {
      const result = await correctMultipleFiles(files, errorContent, analysis)
      return result
    } catch (err) {
      debugError('[corrector] correct error: %s', err instanceof Error ? err.message : String(err))
      throw err
    }
  })

  ipcMain.handle('corrector:save-file', async (_event, args: unknown) => {
    const { filename, content } = args as { filename: string; content: string }

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Enregistrer le fichier corrigé',
      defaultPath: filename,
      filters: [
        { name: 'Fichiers C/C++', extensions: ['c', 'cpp', 'h', 'hpp', 'cxx', 'hxx'] },
        { name: 'Tous les fichiers', extensions: ['*'] }
      ]
    })

    if (canceled || !filePath) return { ok: false }
    fs.writeFileSync(filePath, content, 'utf8')
    audit('corrector.save-file', path.basename(filePath))
    return { ok: true }
  })

  ipcMain.handle('corrector:save-all', async (_event, args: unknown) => {
    const { files } = args as { files: { name: string; content: string }[] }

    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choisir le dossier de destination',
      properties: ['openDirectory', 'createDirectory']
    })

    if (canceled || !filePaths[0]) return { ok: false, savedCount: 0 }

    const dir = filePaths[0]
    let savedCount = 0
    for (const file of files) {
      try {
        fs.writeFileSync(path.join(dir, file.name), file.content, 'utf8')
        savedCount++
      } catch {
        // continue saving others
      }
    }
    audit('corrector.save-all', dir, { savedCount })
    return { ok: true, savedCount }
  })
}
