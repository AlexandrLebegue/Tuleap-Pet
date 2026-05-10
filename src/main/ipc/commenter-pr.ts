import { BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { buildTuleapClient } from '../tuleap/build'
import { getConfig } from '../store/config'
import { processSingleFile } from '../commenter/commenter'
import {
  checkoutBranch,
  createBranch,
  gitAdd,
  gitCommit,
  gitPush,
  listSourceFiles,
  resolveBranchName
} from '../commenter/git-utils'
import { audit } from '../store/db'
import { debugError } from '../logger'
import type { CommenterPRProgress, GitBranch, GitRepository } from '@shared/types'
import type { CommentingOptions } from '../prompts/commenter-prompts'

function computeEta(nextIndex: number, total: number, timings: number[]): number {
  const remaining = total - nextIndex
  if (timings.length === 0) return remaining * 30
  let ema = timings[0]!
  for (let i = 1; i < timings.length; i++) ema = 0.3 * timings[i]! + 0.7 * ema
  return Math.round(remaining * ema)
}

export function registerCommenterPRHandlers(): void {
  ipcMain.handle('commenter-pr:list-repos', async () => {
    const { projectId } = getConfig()
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
          cloneUrl: r.clone_http_url ?? ''
        })
      }
      if (all.length >= page.total || page.items.length === 0) break
      offset += page.items.length
    }
    return all
  })

  ipcMain.handle('commenter-pr:list-branches', async (_event, repoId: number) => {
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

  ipcMain.handle('commenter-pr:choose-dir', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Sélectionner la copie locale du dépôt Git',
      properties: ['openDirectory']
    })
    if (canceled || !filePaths[0]) return { ok: false }
    return { ok: true, path: filePaths[0] }
  })

  ipcMain.handle('commenter-pr:start', async (event, args: unknown) => {
    const { workDir, repoId, branch, options } = args as {
      workDir: string
      repoId: number
      branch: string
      options: CommentingOptions
    }

    const win = BrowserWindow.fromWebContents(event.sender)
    const emit = (payload: CommenterPRProgress): void => {
      win?.webContents.send('commenter-pr:progress', payload)
    }

    audit('commenter-pr.start', String(repoId), { branch })

    try {
      // 1. Checkout the target branch
      emit({ type: 'git', step: 'checkout' })
      await checkoutBranch(workDir, branch)

      // 2. List source files
      const files = await listSourceFiles(workDir)
      if (files.length === 0) {
        throw new Error('Aucun fichier C/C++ trouvé dans ce dépôt (git ls-files).')
      }
      emit({ type: 'start', totalFiles: files.length, estimatedSeconds: files.length * 30 })

      // 3. Process each file
      const timings: number[] = []
      let skipped = 0

      for (let i = 0; i < files.length; i++) {
        const filename = files[i]!
        const etaSeconds = computeEta(i, files.length, timings)
        emit({ type: 'file', index: i, total: files.length, filename, etaSeconds })

        const t0 = Date.now()
        try {
          const fullPath = path.join(workDir, filename)
          const content = fs.readFileSync(fullPath, 'utf8')
          const commented = await processSingleFile(content, filename, options)
          fs.writeFileSync(fullPath, commented, 'utf8')
          timings.push((Date.now() - t0) / 1000)
        } catch (fileErr) {
          skipped++
          debugError('[commenter-pr] skipped %s: %s', filename, fileErr instanceof Error ? fileErr.message : String(fileErr))
        }
      }

      const processed = files.length - skipped

      // 4. Create new branch
      emit({ type: 'git', step: 'branch' })
      const newBranch = await resolveBranchName(workDir, 'ai/comments')
      await createBranch(workDir, newBranch)

      // 5. Git add + commit + push
      emit({ type: 'git', step: 'add' })
      await gitAdd(workDir)

      emit({ type: 'git', step: 'commit' })
      const commitMsg = `[AI] Doxygen comments — ${processed} fichier(s)${skipped > 0 ? `, ${skipped} ignoré(s)` : ''}`
      await gitCommit(workDir, commitMsg)

      emit({ type: 'git', step: 'push' })
      await gitPush(workDir, newBranch)

      // 6. Create Tuleap pull request
      let prId = 0
      let prUrl = ''
      try {
        const client = await buildTuleapClient()
        const pr = await client.createPullRequest({ repoId, sourceBranch: newBranch, targetBranch: branch })
        prId = pr.id
        prUrl = pr.htmlUrl
        emit({ type: 'pr', prId })
      } catch (prErr) {
        debugError('[commenter-pr] PR creation failed: %s', prErr instanceof Error ? prErr.message : String(prErr))
        emit({ type: 'error', message: `Push OK mais la PR a échoué: ${prErr instanceof Error ? prErr.message : String(prErr)}. Vous pouvez créer la PR manuellement depuis la branche "${newBranch}".` })
      }

      emit({ type: 'done', filesProcessed: processed, skippedFiles: skipped, branchName: newBranch })
      audit('commenter-pr.done', String(repoId), { processed, skipped, branch: newBranch, prId })
      return { ok: true, branchName: newBranch, prId, prUrl }

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      debugError('[commenter-pr] error: %s', message)
      emit({ type: 'error', message })
      audit('commenter-pr.error', String(repoId), { message })
      return { ok: false, error: message }
    }
  })
}
