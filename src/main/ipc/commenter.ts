import { BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { processMultipleFiles } from '../commenter/commenter'
import type { CommentingOptions } from '../prompts/commenter-prompts'
import { runContextCommenter } from '../commenter/context-commenter'
import type { ContextCommenterProgress } from '../commenter/context-commenter'
import { getCppProjectRoot } from '../store/config'
import { audit } from '../store/db'
import { debugError } from '../logger'

const SKIP_DIRS = new Set(['build', 'node_modules', '.git', '_deps', 'CMakeFiles', 'out', 'dist'])
function walkForBasenames(root: string, targets: Set<string>, out: Map<string, string[]>, limit: number): void {
  if (Array.from(out.values()).flat().length >= limit) return
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = path.join(root, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      walkForBasenames(full, targets, out, limit)
    } else if (e.isFile() && targets.has(e.name)) {
      const arr = out.get(e.name)
      if (arr) arr.push(full)
      else out.set(e.name, [full])
    }
  }
}

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

  ipcMain.handle('commenter:resolve-sources', async (_event, args: unknown) => {
    const { filenames } = args as { filenames: string[] }
    const root = getCppProjectRoot()
    if (!root) return { ok: false as const, reason: 'no-project-root' }
    if (!fs.existsSync(root)) return { ok: false as const, reason: 'project-missing' }
    const targets = new Set(filenames.map((f) => path.basename(f)))
    const matches = new Map<string, string[]>()
    walkForBasenames(root, targets, matches, 2000)
    const resolved: Record<string, string[]> = {}
    for (const [k, v] of matches) resolved[k] = v
    return { ok: true as const, resolved }
  })

  ipcMain.handle('commenter:run-context', async (event, args: unknown) => {
    const { filePaths, forceAll, depth, tokenBudget } = args as {
      filePaths: string[]
      forceAll?: boolean
      depth?: number
      tokenBudget?: number
    }
    const root = getCppProjectRoot()
    if (!root) throw new Error('no project root configured')

    const win = BrowserWindow.fromWebContents(event.sender)
    const emit = (payload: ContextCommenterProgress): void => {
      win?.webContents.send('commenter:context-progress', payload)
    }

    audit('commenter.context.start', null, { files: filePaths.length, forceAll })
    try {
      const result = await runContextCommenter(
        { projectRoot: root, filePaths, forceAll, depth, tokenBudget },
        emit
      )
      audit('commenter.context.done', null, {
        files: result.files.length,
        totalSkipped: result.files.reduce((s, f) => s + f.skipped, 0),
        totalCommented: result.files.reduce((s, f) => s + f.commented, 0)
      })
      return result
    } catch (err) {
      debugError('[commenter] context error: %s', err instanceof Error ? err.message : String(err))
      throw err
    }
  })
}
