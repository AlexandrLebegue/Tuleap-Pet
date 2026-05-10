import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import { buildTuleapClient } from '../tuleap/build'
import { getConfig } from '../store/config'
import { getTuleapToken, getOAuthBundle } from '../store/secrets'
import { processSingleFile } from '../commenter/commenter'
import {
  cloneRepo,
  listSourceFiles,
  listChangedFiles,
  createBranch,
  gitAdd,
  gitCommit,
  gitPush,
  findTestDirectory
} from '../commenter/git-utils'
import { generateTestsForFile, testOutputFilename } from './test-gen-file'
import { debugError } from '../logger'
import type { BackgroundJob, JobStatus, JobStreamEvent, JobType, CommentingOptions } from '@shared/types'

function makeJobId(): string {
  return randomBytes(4).toString('hex')
}

function emit(win: BrowserWindow | null, event: JobStreamEvent): void {
  win?.webContents.send('jobs:stream', event)
}

function updateStatus(win: BrowserWindow | null, jobId: string, status: JobStatus): void {
  emit(win, { type: 'status', jobId, status })
}

function injectCredentials(cloneUrl: string): string {
  // SSH URLs use key-based auth — no token injection needed
  if (!cloneUrl.startsWith('http')) return cloneUrl

  const { authMode } = getConfig()
  let token: string | null = null
  if (authMode === 'oauth2') {
    token = getOAuthBundle()?.accessToken ?? null
  }
  if (!token) {
    token = getTuleapToken()
  }
  if (!token) return cloneUrl
  try {
    const url = new URL(cloneUrl)
    url.username = 'x'
    url.password = encodeURIComponent(token)
    return url.toString()
  } catch {
    return cloneUrl
  }
}

type JobStartArgs = {
  repoId: number
  repoName: string
  cloneUrl: string
  branchName: string
  type: JobType
  options?: CommentingOptions
}

type ActiveJob = { abort: AbortController }

const activeJobs = new Map<string, ActiveJob>()

export function cancelJob(jobId: string): void {
  const job = activeJobs.get(jobId)
  if (job) {
    job.abort.abort()
  }
}

export function startJob(win: BrowserWindow | null, args: JobStartArgs): string {
  const jobId = makeJobId()
  const abort = new AbortController()
  activeJobs.set(jobId, { abort })

  const job: BackgroundJob = {
    id: jobId,
    type: args.type,
    repoName: args.repoName,
    branchName: args.branchName,
    status: 'queued',
    currentFile: null,
    progress: null,
    error: null,
    prId: null,
    prUrl: null,
    branchCreated: null,
    createdAt: Date.now()
  }

  emit(win, { type: 'queued', job })

  void runJob(win, jobId, args, abort.signal).finally(() => {
    activeJobs.delete(jobId)
  })

  return jobId
}

async function runJob(
  win: BrowserWindow | null,
  jobId: string,
  args: JobStartArgs,
  signal: AbortSignal
): Promise<void> {
  const { tempClonePath } = getConfig()
  if (!tempClonePath) {
    emit(win, { type: 'error', jobId, error: "Aucun dossier temporaire configuré dans les réglages." })
    return
  }

  const targetDir = path.join(tempClonePath, `${args.repoName}_${jobId}`)
  const cleanupDir = (): void => {
    try {
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true })
      }
    } catch { /* ignore cleanup errors */ }
  }

  try {
    if (signal.aborted) { emit(win, { type: 'cancelled', jobId }); return }

    // 1. Clone the specific branch directly (avoids a separate checkout step)
    updateStatus(win, jobId, 'cloning')
    const credUrl = injectCredentials(args.cloneUrl)
    await cloneRepo(credUrl, targetDir, args.branchName)

    // 3. List source files
    const commentOptions: CommentingOptions = args.options ?? {
      preserveExisting: true,
      addFileHeader: true,
      detailedComments: true,
      applyCodingRules: false,
      onlyChangedFiles: false
    }

    let files = await listSourceFiles(targetDir)
    if (commentOptions.onlyChangedFiles) {
      const changed = new Set(await listChangedFiles(targetDir))
      files = files.filter((f) => changed.has(f))
      if (files.length === 0) {
        throw new Error('Aucun fichier C/C++ modifié trouvé dans le dernier commit.')
      }
    } else if (files.length === 0) {
      throw new Error('Aucun fichier C/C++ trouvé dans ce dépôt.')
    }

    // 4. Find test directory (for test-generator only)
    let testDir = ''
    if (args.type === 'test-generator') {
      testDir = await findTestDirectory(targetDir)
    }

    // 5. Process each file
    updateStatus(win, jobId, 'processing')
    let skipped = 0

    for (let i = 0; i < files.length; i++) {
      if (signal.aborted) { cleanupDir(); emit(win, { type: 'cancelled', jobId }); return }

      const filename = files[i]!
      emit(win, { type: 'progress', jobId, current: i + 1, total: files.length, currentFile: filename })

      // Skip test files when generating tests — no point testing the tests
      if (args.type === 'test-generator' && /test/i.test(path.basename(filename))) {
        skipped++
        continue
      }

      try {
        const fullPath = path.join(targetDir, filename)
        const content = fs.readFileSync(fullPath, 'utf8')

        if (args.type === 'commentateur') {
          const commented = await processSingleFile(content, filename, commentOptions)
          fs.writeFileSync(fullPath, commented, 'utf8')
        } else {
          const testCode = await generateTestsForFile(content, filename)
          const outName = testOutputFilename(filename)
          const outDir = testDir ? path.join(targetDir, testDir) : targetDir
          fs.mkdirSync(outDir, { recursive: true })
          fs.writeFileSync(path.join(outDir, outName), testCode, 'utf8')
        }
      } catch (fileErr) {
        skipped++
        debugError('[job-manager] skipped %s: %s', filename, fileErr instanceof Error ? fileErr.message : String(fileErr))
      }
    }

    // 6. Commit
    if (signal.aborted) { cleanupDir(); emit(win, { type: 'cancelled', jobId }); return }
    updateStatus(win, jobId, 'committing')

    const branchKind = args.type === 'commentateur' ? 'comments' : 'tests'
    const newBranch = `tuleap-pet/${branchKind}-${randomBytes(3).toString('hex')}`
    await createBranch(targetDir, newBranch)
    await gitAdd(targetDir)

    const processed = files.length - skipped
    const msg =
      args.type === 'commentateur'
        ? `[AI] Commentaires Doxygen — ${processed} fichier(s)${skipped > 0 ? `, ${skipped} ignoré(s)` : ''}`
        : `[AI] Tests unitaires — ${processed} fichier(s)${skipped > 0 ? `, ${skipped} ignoré(s)` : ''}`
    await gitCommit(targetDir, msg)

    // 7. Push
    if (signal.aborted) { cleanupDir(); emit(win, { type: 'cancelled', jobId }); return }
    updateStatus(win, jobId, 'pushing')
    await gitPush(targetDir, newBranch)

    // 8. Create PR
    updateStatus(win, jobId, 'creating-pr')
    let prId: number | null = null
    let prUrl: string | null = null
    try {
      const client = await buildTuleapClient()
      const pr = await client.createPullRequest({
        repoId: args.repoId,
        sourceBranch: newBranch,
        targetBranch: args.branchName
      })
      prId = pr.id
      prUrl = pr.htmlUrl || null
    } catch (prErr) {
      debugError('[job-manager] PR creation failed: %s', prErr instanceof Error ? prErr.message : String(prErr))
    }

    emit(win, { type: 'done', jobId, prId, prUrl, branchCreated: newBranch })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    debugError('[job-manager] job %s error: %s', jobId, message)
    emit(win, { type: 'error', jobId, error: message })
  } finally {
    cleanupDir()
  }
}
