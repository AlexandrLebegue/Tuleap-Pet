import { BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import { buildTuleapClient } from '../tuleap'
import { resolveSvnUrl } from '../tuleap/svn-url'
import { getConfig, setSvnPath } from '../store/config'
import { svnList, svnLog, execSvn, resolveSvnBinary, SvnError } from '../svn/svn-utils'
import { buildSvnAuthArgs, explainSvnAuthFailure } from '../svn/svn-credentials'
import { checkoutAndIndex, generateSvnPatch, cleanupWorkDir } from '../svn/patch-job'
import { audit } from '../store/db'
import { debugError } from '../logger'
import type {
  SvnRepository,
  SvnPathEntry,
  SvnCommit,
  SvnPatchResult,
  HeaderEntry,
  CommentTarget
} from '@shared/types'

export function registerSvnExplorerHandlers(): void {
  // List the SVN repositories of the configured project.
  ipcMain.handle('svn:list-repos', async (): Promise<SvnRepository[]> => {
    const { projectId, tuleapUrl } = getConfig()
    if (!projectId) throw new Error('Aucun projet sélectionné dans les réglages.')
    const client = await buildTuleapClient()
    const all: SvnRepository[] = []
    let offset = 0
    while (true) {
      const page = await client.listSvnRepositories(projectId, { limit: 50, offset })
      for (const r of page.items) {
        all.push({
          id: r.id,
          name: r.name,
          description: r.description ?? '',
          svnUrl: resolveSvnUrl(r, tuleapUrl)
        })
      }
      if (all.length >= page.total || page.items.length === 0) break
      offset += page.items.length
    }
    return all
  })

  // List the immediate children of an SVN URL (trunk / branches / tags / deeper).
  ipcMain.handle(
    'svn:list-paths',
    async (
      _event,
      args: unknown
    ): Promise<{ ok: true; entries: SvnPathEntry[] } | { ok: false; error: string }> => {
      const { svnUrl } = args as { svnUrl: string }
      if (!svnUrl) return { ok: false, error: 'URL SVN manquante.' }
      try {
        const authArgs = await buildSvnAuthArgs(svnUrl)
        const entries = await svnList(svnUrl, authArgs)
        return { ok: true, entries }
      } catch (err) {
        const raw = err instanceof SvnError ? err.stderr || err.message : String(err)
        return {
          ok: false,
          error: explainSvnAuthFailure(raw) ?? (err instanceof Error ? err.message : raw)
        }
      }
    }
  )

  // Read recent revisions for an SVN URL (no checkout needed).
  ipcMain.handle(
    'svn:list-log',
    async (
      _event,
      args: unknown
    ): Promise<{ ok: true; commits: SvnCommit[] } | { ok: false; error: string }> => {
      const { svnUrl, limit } = args as { svnUrl: string; limit?: number }
      if (!svnUrl) return { ok: false, error: 'URL SVN manquante.' }
      try {
        const authArgs = await buildSvnAuthArgs(svnUrl)
        const commits = await svnLog(svnUrl, { limit: limit ?? 30, authArgs })
        return { ok: true, commits }
      } catch (err) {
        const raw = err instanceof SvnError ? err.stderr || err.message : String(err)
        return {
          ok: false,
          error: explainSvnAuthFailure(raw) ?? (err instanceof Error ? err.message : raw)
        }
      }
    }
  )

  // Checkout a path + build the header/function index for the picker.
  ipcMain.handle(
    'svn:checkout-and-index',
    async (
      _event,
      args: unknown
    ): Promise<
      | { ok: true; workDir: string; revision: number | null; headers: HeaderEntry[] }
      | { ok: false; error: string }
    > => {
      const { svnUrl, repoName } = args as { svnUrl: string; repoName: string }
      audit('svn.checkout', repoName, { svnUrl })
      return checkoutAndIndex(svnUrl, repoName)
    }
  )

  // Run the commenter over the working copy and return the unified diff (patch).
  ipcMain.handle(
    'svn:generate-patch',
    async (
      event,
      args: unknown
    ): Promise<{ ok: true; result: SvnPatchResult } | { ok: false; error: string }> => {
      const { workDir, commentTargets, commentHeader, commentBody, depth } = args as {
        workDir: string
        commentTargets: CommentTarget[]
        commentHeader: boolean
        commentBody: boolean
        depth?: number
      }
      const win = BrowserWindow.fromWebContents(event.sender)
      audit('svn.generate-patch', workDir, { targets: commentTargets?.length ?? 0 })
      try {
        const result = await generateSvnPatch(
          workDir,
          commentTargets ?? [],
          { commentHeader, commentBody, depth },
          (ev) => {
            if (ev.type === 'function') {
              win?.webContents.send('svn:patch-progress', {
                current: ev.index,
                total: ev.total,
                name: ev.name
              })
            }
          }
        )
        return { ok: true, result }
      } catch (err) {
        debugError(
          '[svn] generate-patch error: %s',
          err instanceof Error ? err.message : String(err)
        )
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle('svn:cleanup', (_event, args: unknown): void => {
    const { workDir } = args as { workDir?: string }
    if (workDir) cleanupWorkDir(workDir)
  })

  // Save a generated patch to disk via the native dialog.
  ipcMain.handle(
    'svn:save-patch',
    async (
      _event,
      args: unknown
    ): Promise<{ ok: true; path: string } | { ok: false; cancelled?: true; error?: string }> => {
      const { patch, defaultName } = args as { patch: string; defaultName?: string }
      if (typeof patch !== 'string' || patch.length === 0) {
        return { ok: false, error: 'Patch vide.' }
      }
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Enregistrer le patch SVN',
        defaultPath: defaultName || 'changes.patch',
        filters: [
          { name: 'Patch', extensions: ['patch', 'diff'] },
          { name: 'Tous les fichiers', extensions: ['*'] }
        ]
      })
      if (canceled || !filePath) return { ok: false, cancelled: true }
      try {
        fs.writeFileSync(filePath, patch, 'utf8')
        return { ok: true, path: filePath }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // ─── Settings: svn binary path ──────────────────────────────────────────────

  ipcMain.handle(
    'svn:detect-binary',
    async (): Promise<{ available: boolean; path: string; version: string | null }> => {
      const bin = resolveSvnBinary()
      try {
        const out = await execSvn(['--version', '--quiet'])
        return { available: true, path: bin, version: out.trim() }
      } catch {
        return { available: false, path: bin, version: null }
      }
    }
  )

  ipcMain.handle('settings:set-svn-path', (_event, p: unknown): { svnPath: string | null } => {
    const value = typeof p === 'string' ? p : null
    setSvnPath(value)
    return { svnPath: getConfig().svnPath }
  })

  ipcMain.handle(
    'settings:choose-svn-binary',
    async (): Promise<{ ok: true; path: string } | { ok: false; cancelled: true }> => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Sélectionner le binaire svn (TortoiseSVN command-line tools)',
        properties: ['openFile']
      })
      if (canceled || !filePaths[0]) return { ok: false, cancelled: true }
      return { ok: true, path: filePaths[0] }
    }
  )
}
