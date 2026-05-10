import { dialog } from 'electron'
import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { processMultipleFiles } from '../commenter/commenter'
import type { CommentingOptions } from '../prompts/commenter-prompts'
import { audit } from '../store/db'
import { debugError } from '../logger'

export function registerCommenterHandlers(): void {
  ipcMain.handle('commenter:process', async (_event, args: unknown) => {
    const { files, options } = args as {
      files: { name: string; content: string }[]
      options: CommentingOptions
    }

    audit('commenter.process', null, { fileCount: files.length })

    try {
      const result = await processMultipleFiles(files, options)
      return result
    } catch (err) {
      debugError('[commenter] process error: %s', err instanceof Error ? err.message : String(err))
      throw err
    }
  })

  ipcMain.handle('commenter:save-file', async (_event, args: unknown) => {
    const { filename, content } = args as { filename: string; content: string }

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Enregistrer le fichier commenté',
      defaultPath: filename,
      filters: [
        { name: 'Fichiers C/C++', extensions: ['c', 'cpp', 'h', 'hpp', 'cxx', 'hxx', 'cc'] },
        { name: 'Tous les fichiers', extensions: ['*'] }
      ]
    })

    if (canceled || !filePath) return { ok: false }

    fs.writeFileSync(filePath, content, 'utf8')
    audit('commenter.save-file', path.basename(filePath))
    return { ok: true }
  })

  ipcMain.handle('commenter:save-all', async (_event, args: unknown) => {
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
    audit('commenter.save-all', dir, { savedCount })
    return { ok: true, savedCount }
  })
}
