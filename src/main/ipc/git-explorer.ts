import { BrowserWindow, dialog, ipcMain } from 'electron'
import { buildTuleapClient, mapGitCommit } from '../tuleap'
import { getConfig, setTempClonePath, setGitCloneSsh } from '../store/config'
import { startJob, cancelJob } from '../jobs/job-manager'
import { resolveCloneUrl } from '../tuleap/clone-url'
import type {
  GitBranch,
  GitRepository,
  Page,
  GitCommit,
  JobType,
  CommentingOptions,
  TestGenSelection
} from '@shared/types'

function buildSettingsState() {
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

  ipcMain.handle('git:start-job', async (event, args: unknown): Promise<{ jobId: string }> => {
    const { repoId, repoName, cloneUrl, branchName, type, options, selection, existingCloneDir } =
      args as {
        repoId: number
        repoName: string
        cloneUrl: string
        branchName: string
        type: JobType
        options?: CommentingOptions
        selection?: TestGenSelection[]
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
