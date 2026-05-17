import { dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { audit } from '../store/db'
import { debugError } from '../logger'
import { getCppProjectRoot, setCppProjectRoot } from '../store/config'

export type CppProjectInfo = {
  path: string | null
  exists: boolean
  hasCMake: boolean
  label: string | null
}

function probe(root: string | null): CppProjectInfo {
  if (!root) return { path: null, exists: false, hasCMake: false, label: null }
  let exists = false
  try {
    exists = fs.statSync(root).isDirectory()
  } catch {
    exists = false
  }
  const hasCMake = exists && fs.existsSync(path.join(root, 'CMakeLists.txt'))
  return { path: root, exists, hasCMake, label: path.basename(root) }
}

export function registerProjectRootHandlers(): void {
  ipcMain.handle('project-root:get', async () => probe(getCppProjectRoot()))

  ipcMain.handle('project-root:pick', async () => {
    const current = getCppProjectRoot()
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Sélectionner la racine du projet C/C++',
      properties: ['openDirectory'],
      defaultPath: current ?? undefined
    })
    if (canceled || !filePaths[0]) {
      return { ok: false as const, project: probe(current) }
    }
    const chosen = filePaths[0]
    try {
      setCppProjectRoot(chosen)
      audit('project-root.set', null, { path: chosen })
      return { ok: true as const, project: probe(chosen) }
    } catch (err) {
      debugError('[project-root] persist error: %s', err instanceof Error ? err.message : String(err))
      throw err
    }
  })

  ipcMain.handle('project-root:clear', async () => {
    setCppProjectRoot(null)
    audit('project-root.clear', null, {})
    return probe(null)
  })
}
