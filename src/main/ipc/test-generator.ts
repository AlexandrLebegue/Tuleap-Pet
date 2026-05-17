import { BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { extractFunctions, generateTestsGranular } from '../test-generator/test-generator'
import { runPipeline } from '../test-generator/pipeline'
import type { PipelineProgress } from '../test-generator/pipeline'
import { getCppProjectRoot } from '../store/config'
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

  ipcMain.handle('testgen:resolve-source', async (_event, args: unknown) => {
    const { filename } = args as { filename: string }
    const root = getCppProjectRoot()
    if (!root) return { ok: false as const, reason: 'no-project-root' }
    if (!fs.existsSync(root)) return { ok: false as const, reason: 'project-missing' }
    const base = path.basename(filename)
    const matches: string[] = []
    walkForBasename(root, base, matches, 1000)
    if (matches.length === 0) return { ok: false as const, reason: 'not-found' }
    return { ok: true as const, candidates: matches }
  })

  ipcMain.handle('testgen:run-pipeline', async (event, args: unknown) => {
    const { sourceFilePath, onlyFunctions, buildEnabled, preset, maxRepairs } = args as {
      sourceFilePath: string
      onlyFunctions?: string[]
      buildEnabled: boolean
      preset?: string
      maxRepairs?: number
    }
    const root = getCppProjectRoot()
    if (!root) throw new Error('no project root configured')

    const win = BrowserWindow.fromWebContents(event.sender)
    const emit = (payload: PipelineProgress): void => {
      win?.webContents.send('testgen:pipeline-progress', payload)
    }

    audit('testgen.pipeline.start', null, { sourceFilePath, buildEnabled, preset })
    try {
      const result = await runPipeline(
        {
          projectRoot: root,
          sourceFilePath,
          onlyFunctions,
          buildEnabled,
          preset,
          maxRepairs
        },
        emit
      )
      audit('testgen.pipeline.done', null, {
        files: result.testFiles.length,
        buildOk: result.build?.ok ?? null,
        iterations: result.iterations
      })
      return result
    } catch (err) {
      debugError('[testgen] pipeline error: %s', err instanceof Error ? err.message : String(err))
      throw err
    }
  })
}

function walkForBasename(root: string, target: string, out: string[], limit: number): void {
  if (out.length >= limit) return
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (out.length >= limit) break
    const full = path.join(root, e.name)
    if (e.isDirectory()) {
      if (e.name === 'build' || e.name === 'node_modules' || e.name.startsWith('.git') || e.name === '_deps' || e.name === 'CMakeFiles') continue
      walkForBasename(full, target, out, limit)
    } else if (e.isFile() && e.name === target) {
      out.push(full)
    }
  }
}
