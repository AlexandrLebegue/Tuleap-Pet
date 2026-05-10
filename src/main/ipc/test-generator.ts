import { dialog } from 'electron'
import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { extractFunctions, generateTestsGranular } from '../test-generator/test-generator'
import { audit } from '../store/db'
import { debugError } from '../logger'

export function registerTestGeneratorHandlers(): void {
  ipcMain.handle('testgen:extract-functions', async (_event, args: unknown) => {
    const { filename, content } = args as { filename: string; content: string }
    audit('testgen.extract', null, { filename })
    try {
      const result = extractFunctions(content, filename)
      return { functions: result.functions, fileInfo: result.fileInfo }
    } catch (err) {
      debugError('[testgen] extract error: %s', err instanceof Error ? err.message : String(err))
      throw err
    }
  })

  ipcMain.handle('testgen:generate-all', async (_event, args: unknown) => {
    const { filename, content } = args as { filename: string; content: string }
    audit('testgen.generate', null, { filename })
    try {
      const result = await generateTestsGranular(content, filename)
      return {
        testFiles: result.testFiles,
        metrics: result.metrics
      }
    } catch (err) {
      debugError('[testgen] generate error: %s', err instanceof Error ? err.message : String(err))
      throw err
    }
  })

  ipcMain.handle('testgen:save-file', async (_event, args: unknown) => {
    const { filename, content } = args as { filename: string; content: string }

    const ext = filename.endsWith('.py') ? 'py' : 'cpp'
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Enregistrer le fichier de test',
      defaultPath: filename,
      filters: [
        { name: ext === 'py' ? 'Python' : 'C++', extensions: [ext] },
        { name: 'Tous les fichiers', extensions: ['*'] }
      ]
    })

    if (canceled || !filePath) return { ok: false }
    fs.writeFileSync(filePath, content, 'utf8')
    audit('testgen.save-file', path.basename(filePath))
    return { ok: true }
  })

  ipcMain.handle('testgen:save-all', async (_event, args: unknown) => {
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
        // continue
      }
    }
    audit('testgen.save-all', dir, { savedCount })
    return { ok: true, savedCount }
  })
}
