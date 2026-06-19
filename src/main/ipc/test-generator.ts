import { BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { extractFunctions, generateTestsGranular } from '../test-generator/test-generator'
import { parseFile } from '../cpp-analyzer/parser'
import { functionDefToParsed, buildFileInfoFromDefs } from '../test-generator/fn-adapter'
import { runPipeline } from '../test-generator/pipeline'
import type { PipelineProgress } from '../test-generator/pipeline'
import { buildHeaderIndex } from '../test-generator/header-index'
import { getCppProjectRoot, getConfig } from '../store/config'
import { audit } from '../store/db'
import { debugError } from '../logger'
import { cloneRepo, listSourceFiles, listChangedFiles } from '../commenter/git-utils'
import { injectGitCredentials } from '../jobs/git-credentials'
import { listCppFiles, findFilesByBasename } from '../cpp-analyzer/fs-scan'
import { isCppFile } from '../cpp-analyzer/pairing'

export function registerTestGeneratorHandlers(): void {
  ipcMain.handle('testgen:extract-functions', async (_event, args: unknown) => {
    const { filename, content } = args as { filename: string; content: string }
    audit('testgen.extract', null, { filename })
    try {
      const isPython = filename.endsWith('.py')
      if (isPython) {
        // Python: use the original code-parser
        const result = extractFunctions(content, filename)
        return { functions: result.functions, fileInfo: result.fileInfo }
      }
      // C/C++: use the superior cpp-analyzer parser
      const defs = parseFile(filename, content)
      const functions = defs.map(functionDefToParsed)
      const fileInfo = buildFileInfoFromDefs(defs, filename)
      return { functions, fileInfo }
    } catch (err) {
      debugError('[testgen] extract error: %s', err instanceof Error ? err.message : String(err))
      throw err
    }
  })

  ipcMain.handle('testgen:generate-all', async (_event, args: unknown) => {
    const { filename, content, onlyFunctions, sourceFilePath } = args as {
      filename: string
      content: string
      onlyFunctions?: string[]
      sourceFilePath?: string
    }
    audit('testgen.generate', null, { filename, selectedCount: onlyFunctions?.length ?? null })
    try {
      const root = getCppProjectRoot() ?? undefined
      const result = await generateTestsGranular(
        content,
        filename,
        onlyFunctions,
        undefined,
        root,
        sourceFilePath
      )
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
    const matches = findFilesByBasename(root, new Set([base]), 1000).get(base) ?? []
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

  // ---- Source input: git repo mode ----

  ipcMain.handle('testgen:git-clone-and-list', async (_event, args: unknown) => {
    const { repoUrl, branch, onlyRecentFiles } = args as {
      repoUrl: string
      branch: string
      onlyRecentFiles: boolean
    }
    const { tempClonePath } = getConfig()
    if (!tempClonePath) {
      return {
        ok: false as const,
        error: 'Chemin de clonage temporaire non configuré dans les Paramètres.'
      }
    }

    const cloneDir = path.join(tempClonePath, `testgen-clone-${Date.now()}`)
    try {
      const credUrl = await injectGitCredentials(repoUrl)
      await cloneRepo(credUrl, cloneDir, branch || undefined)

      let files: string[]
      if (onlyRecentFiles) {
        const changed = await listChangedFiles(cloneDir)
        files = changed.filter((f) => isCppFile(f))
      } else {
        files = await listSourceFiles(cloneDir)
      }

      return { ok: true as const, cloneDir, files }
    } catch (err) {
      try {
        fs.rmSync(cloneDir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('testgen:build-header-index', async (_event, args: unknown) => {
    const { cloneDir } = args as { cloneDir: string }
    if (!cloneDir || !fs.existsSync(cloneDir)) {
      return { ok: false as const, error: 'Dossier de clonage introuvable.' }
    }
    audit('testgen.build-header-index', cloneDir)
    try {
      const headers = buildHeaderIndex(cloneDir)
      return { ok: true as const, cloneDir, headers }
    } catch (err) {
      debugError(
        '[testgen] header-index error: %s',
        err instanceof Error ? err.message : String(err)
      )
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('testgen:cleanup-clone-dir', async (_event, args: unknown) => {
    const { cloneDir } = args as { cloneDir: string }
    try {
      fs.rmSync(cloneDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  })

  ipcMain.handle('testgen:read-file-from-dir', async (_event, args: unknown) => {
    const { cloneDir, relativePath } = args as { cloneDir: string; relativePath: string }
    try {
      const content = fs.readFileSync(path.join(cloneDir, relativePath), 'utf8')
      return { ok: true as const, content }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ---- Source input: local folder mode ----

  ipcMain.handle('testgen:list-folder-files', async (_event, args: unknown) => {
    const { folderPath } = args as { folderPath: string }
    if (!fs.existsSync(folderPath)) return { ok: false as const, error: 'Dossier introuvable.' }
    const files = listCppFiles(folderPath, 5000).map((p) =>
      path.relative(folderPath, p).replace(/\\/g, '/')
    )
    return { ok: true as const, files }
  })

  ipcMain.handle('testgen:choose-folder-for-source', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choisir un dossier C/C++',
      properties: ['openDirectory']
    })
    if (canceled || !filePaths[0]) return { ok: false as const, cancelled: true as const }
    return { ok: true as const, path: filePaths[0] }
  })
}
