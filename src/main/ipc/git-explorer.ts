import { BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { buildTuleapClient, mapGitCommit } from '../tuleap'
import { getConfig, setTempClonePath, setGitCloneSsh } from '../store/config'
import { startJob, cancelJob } from '../jobs/job-manager'
import { resolveCloneUrl } from '../tuleap/clone-url'
import { cloneRepo, listSourceFiles, listChangedFiles } from '../commenter/git-utils'
import { injectGitCredentials, explainGitAuthFailure } from '../jobs/git-credentials'
import { findCompileScripts } from '../warning-corrector/compile-runner'
import type {
  GitBranch,
  GitRepository,
  Page,
  GitCommit,
  JobType,
  CommentingOptions,
  TestGenSelection,
  CommentTarget,
  WarningCorrectorJobOptions
} from '@shared/types'

function buildSettingsState(): { tempClonePath: string | null; gitCloneSsh: boolean } {
  const config = getConfig()
  return { tempClonePath: config.tempClonePath, gitCloneSsh: config.gitCloneSsh }
}

export function registerGitExplorerHandlers(): void {
  ipcMain.handle('git:list-repos', async (): Promise<GitRepository[]> => {
    const { projectId, tuleapUrl, gitCloneSsh } = getConfig()
    if (!projectId) throw new Error('Aucun projet sélectionné dans les réglages.')
    const client = await buildTuleapClient()
    const all: GitRepository[] = []
    let offset = 0
    while (true) {
      const page = await client.listGitRepositories(projectId, { limit: 50, offset })
      for (const r of page.items) {
        all.push({
          id: r.id,
          name: r.name,
          description: r.description ?? '',
          cloneUrl: resolveCloneUrl(r, tuleapUrl, gitCloneSsh)
        })
      }
      if (all.length >= page.total || page.items.length === 0) break
      offset += page.items.length
    }
    return all
  })

  ipcMain.handle('git:list-branches', async (_event, repoId: number): Promise<GitBranch[]> => {
    const client = await buildTuleapClient()
    const all: GitBranch[] = []
    let offset = 0
    while (true) {
      const page = await client.listBranches(repoId, { limit: 50, offset })
      for (const b of page.items) {
        all.push({ name: b.name })
      }
      if (all.length >= page.total || page.items.length === 0) break
      offset += page.items.length
    }
    return all
  })

  ipcMain.handle('git:list-commits', async (_event, args: unknown): Promise<Page<GitCommit>> => {
    const { repoId, branchName, offset } = args as {
      repoId: number
      branchName: string
      offset?: number
    }
    const client = await buildTuleapClient()
    const page = await client.listCommits(repoId, {
      refName: branchName,
      limit: 30,
      offset: offset ?? 0
    })
    return {
      items: page.items.map(mapGitCommit),
      total: page.total,
      limit: page.limit,
      offset: page.offset
    }
  })

  // Clone a branch asynchronously and list its source files (+ files changed in
  // the last commit). Used by the commenter file picker; the returned cloneDir
  // is later reused by the job via existingCloneDir.
  ipcMain.handle(
    'git:clone-and-list',
    async (
      _event,
      args: unknown
    ): Promise<
      | { ok: true; cloneDir: string; files: string[]; changedFiles: string[] }
      | { ok: false; error: string }
    > => {
      const { repoName, cloneUrl, branchName } = args as {
        repoName: string
        cloneUrl: string
        branchName: string
      }
      const { tempClonePath } = getConfig()
      if (!tempClonePath) {
        return { ok: false, error: 'Aucun dossier temporaire configuré dans les réglages.' }
      }
      const cloneDir = path.join(tempClonePath, `${repoName}_sel_${Date.now().toString(36)}`)
      try {
        const credUrl = await injectGitCredentials(cloneUrl)
        await cloneRepo(credUrl, cloneDir, branchName)
        const files = await listSourceFiles(cloneDir)
        const changed = new Set(await listChangedFiles(cloneDir))
        const changedFiles = files.filter((f) => changed.has(f))
        return { ok: true, cloneDir, files, changedFiles }
      } catch (err) {
        try {
          if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true })
        } catch {
          /* ignore */
        }
        const raw = err instanceof Error ? err.message : String(err)
        return { ok: false, error: explainGitAuthFailure(raw) ?? raw }
      }
    }
  )

  ipcMain.handle('git:cleanup-clone', (_event, dir: unknown): void => {
    if (typeof dir !== 'string' || !dir) return
    try {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  })

  // Warning-corrector: detect whether the clone ships an `ai_compil` script.
  ipcMain.handle(
    'git:detect-compile-script',
    (_event, args: unknown): { found: boolean; scripts: string[] } => {
      const { cloneDir } = args as { cloneDir: string }
      if (!cloneDir || !fs.existsSync(cloneDir)) return { found: false, scripts: [] }
      const scripts = findCompileScripts(cloneDir).map((s) =>
        path.relative(cloneDir, s).replace(/\\/g, '/')
      )
      return { found: scripts.length > 0, scripts }
    }
  )

  // Warning-corrector: write a user-supplied `ai_compil` script at the clone root.
  ipcMain.handle(
    'git:write-compile-script',
    (_event, args: unknown): { ok: true; path: string } | { ok: false; error: string } => {
      const { cloneDir, filename, content } = args as {
        cloneDir: string
        filename?: string
        content: string
      }
      if (!cloneDir || !fs.existsSync(cloneDir)) {
        return { ok: false, error: 'Dossier de clonage introuvable.' }
      }
      const name = path.basename(filename ?? 'ai_compil.bat')
      if (!/^ai_compil\.(bat|cmd|sh)$/i.test(name)) {
        return { ok: false, error: 'Nom de script invalide (attendu : ai_compil.bat/.sh/.cmd).' }
      }
      if (typeof content !== 'string' || content.trim().length === 0) {
        return { ok: false, error: 'Le contenu du script est vide.' }
      }
      try {
        const target = path.join(cloneDir, name)
        fs.writeFileSync(target, content, 'utf8')
        if (name.toLowerCase().endsWith('.sh')) {
          try {
            fs.chmodSync(target, 0o755)
          } catch {
            /* ignore */
          }
        }
        return { ok: true, path: name }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle('git:start-job', async (event, args: unknown): Promise<{ jobId: string }> => {
    const {
      repoId,
      repoName,
      cloneUrl,
      branchName,
      type,
      options,
      selection,
      selectedFiles,
      commentTargets,
      warningOptions,
      existingCloneDir
    } = args as {
      repoId: number
      repoName: string
      cloneUrl: string
      branchName: string
      type: JobType
      options?: CommentingOptions
      selection?: TestGenSelection[]
      selectedFiles?: string[]
      commentTargets?: CommentTarget[]
      warningOptions?: WarningCorrectorJobOptions
      existingCloneDir?: string
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    const jobId = startJob(win, {
      repoId,
      repoName,
      cloneUrl,
      branchName,
      type,
      options,
      selection,
      selectedFiles,
      commentTargets,
      warningOptions,
      existingCloneDir
    })
    return { jobId }
  })

  ipcMain.handle('git:cancel-job', (_event, jobId: string): void => {
    cancelJob(jobId)
  })

  ipcMain.handle(
    'settings:set-git-clone-ssh',
    (_event, value: unknown): { tempClonePath: string | null; gitCloneSsh: boolean } => {
      setGitCloneSsh(value === true)
      return buildSettingsState()
    }
  )

  ipcMain.handle(
    'settings:set-temp-clone-path',
    (_event, p: unknown): { tempClonePath: string | null; gitCloneSsh: boolean } => {
      const path = typeof p === 'string' ? p : null
      setTempClonePath(path)
      return buildSettingsState()
    }
  )

  ipcMain.handle(
    'settings:choose-temp-dir',
    async (): Promise<{ ok: true; path: string } | { ok: false; cancelled: true }> => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Sélectionner le dossier temporaire pour le clonage Git',
        properties: ['openDirectory']
      })
      if (canceled || !filePaths[0]) return { ok: false, cancelled: true }
      return { ok: true, path: filePaths[0] }
    }
  )
}
