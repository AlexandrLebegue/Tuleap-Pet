import { BrowserWindow, dialog, ipcMain } from 'electron'
import { buildTuleapClient, mapGitCommit } from '../tuleap'
import { getConfig, setTempClonePath, setGitCloneSsh } from '../store/config'
import { startJob, cancelJob } from '../jobs/job-manager'
import { debugError } from '../logger'
import type { GitBranch, GitRepository, Page, GitCommit, JobType, CommentingOptions } from '@shared/types'
import type { GitRepositoryRaw } from '../tuleap/schemas'

function pickString(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = raw[k]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return ''
}

function resolveCloneUrl(r: GitRepositoryRaw, tuleapUrl: string | null, useSsh: boolean): string {
  const raw = r as Record<string, unknown>

  if (useSsh) {
    // Prefer SSH URL directly from Tuleap response — use as-is, no .git appended
    const ssh = pickString(raw, 'clone_ssh_url', 'ssh_url')
      || (raw['clone_url'] as Record<string, unknown> | undefined)?.['ssh'] as string | undefined
      || ''
    if (ssh) return ssh

    // Fallback: construct standard Tuleap SSH URL from the repo path
    const repoPath = pickString(raw, 'path').replace(/\.git$/, '')
    if (tuleapUrl && repoPath) {
      try {
        const host = new URL(tuleapUrl).hostname
        return `ssh://gitolite@${host}/${repoPath}.git`
      } catch { /* ignore */ }
    }
  } else {
    // HTTP mode — try all known field names
    const http = pickString(raw, 'clone_http_url', 'http_url', 'clone_http', 'repository_http_url')
      || (raw['clone_url'] as Record<string, unknown> | undefined)?.['http'] as string | undefined
      || ''
    if (http) return http

    // Fallback: construct standard Tuleap HTTPS URL from the repo path
    const repoPath = pickString(raw, 'path').replace(/\.git$/, '')
    if (tuleapUrl && repoPath) {
      const base = tuleapUrl.replace(/\/+$/, '')
      return `${base}/plugins/git/${repoPath}.git`
    }
  }

  debugError(
    '[git-explorer] Cannot resolve %s clone URL for repo "%s". Raw: %s',
    useSsh ? 'SSH' : 'HTTP',
    r.name,
    JSON.stringify(raw, null, 2).slice(0, 1000)
  )
  return ''
}

function buildSettingsState() {
  const config = getConfig()
  return { tempClonePath: config.tempClonePath, gitCloneSsh: config.gitCloneSsh }
}

export function registerGitExplorerHandlers(): void {
  ipcMain.handle('git:list-repos', async (): Promise<GitRepository[]> => {
    const { projectId, tuleapUrl, gitCloneSsh } = getConfig()
    if (!projectId) throw new Error("Aucun projet sélectionné dans les réglages.")
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

  ipcMain.handle(
    'git:list-commits',
    async (_event, args: unknown): Promise<Page<GitCommit>> => {
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
    }
  )

  ipcMain.handle('git:start-job', async (event, args: unknown): Promise<{ jobId: string }> => {
    const { repoId, repoName, cloneUrl, branchName, type, options } = args as {
      repoId: number
      repoName: string
      cloneUrl: string
      branchName: string
      type: JobType
      options?: CommentingOptions
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    const jobId = startJob(win, { repoId, repoName, cloneUrl, branchName, type, options })
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
