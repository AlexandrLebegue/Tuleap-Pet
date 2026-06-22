import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import { buildTuleapClient } from '../tuleap/build'
import { getConfig } from '../store/config'
import { runSelectiveCommenter } from '../commenter/selective-commenter'
import type { SelectiveCommentProgress } from '../commenter/selective-commenter'
import {
  cloneRepo,
  createBranch,
  gitAdd,
  gitCommit,
  gitPush,
  findTestDirectory
} from '../commenter/git-utils'
import { generateTestsGranular } from '../test-generator/test-generator'
import { runWarningCorrector, buildWarningPrSummary } from '../warning-corrector/warning-corrector'
import type { WarningCorrectorProgress } from '../warning-corrector/warning-corrector'
import { injectGitCredentials, explainGitAuthFailure } from './git-credentials'
import { debugError } from '../logger'
import type {
  BackgroundJob,
  JobStatus,
  JobStreamEvent,
  JobType,
  CommentingOptions,
  TestGenSelection,
  CommentTarget,
  WarningCorrectorJobOptions
} from '@shared/types'

function makeJobId(): string {
  return randomBytes(4).toString('hex')
}

function emit(win: BrowserWindow | null, event: JobStreamEvent): void {
  win?.webContents.send('jobs:stream', event)
}

function updateStatus(win: BrowserWindow | null, jobId: string, status: JobStatus): void {
  emit(win, { type: 'status', jobId, status })
}

// injectCredentials is delegated to injectGitCredentials in jobs/git-credentials.ts
// (resolves the Tuleap username via getSelf() so Tuleap accepts the basic-auth pair).

type JobStartArgs = {
  repoId: number
  repoName: string
  cloneUrl: string
  branchName: string
  type: JobType
  options?: CommentingOptions
  /** Commenter only: subset of source files to process (relative paths). */
  selectedFiles?: string[]
  /** Commenter only: functions to document (header brief + body comments). */
  commentTargets?: CommentTarget[]
  /** Test-generator + warning-corrector: source files + the functions in scope. */
  selection?: TestGenSelection[]
  /** Warning-corrector only: retry budget for the recompile→correct loop. */
  warningOptions?: WarningCorrectorJobOptions
  /** Reuse an already-cloned working dir (e.g. from the file-selection step) instead of cloning again. */
  existingCloneDir?: string
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
    emit(win, {
      type: 'error',
      jobId,
      error: 'Aucun dossier temporaire configuré dans les réglages.'
    })
    return
  }

  const reuseClone = !!args.existingCloneDir && fs.existsSync(args.existingCloneDir)
  const targetDir = reuseClone
    ? args.existingCloneDir!
    : path.join(tempClonePath, `${args.repoName}_${jobId}`)
  const cleanupDir = (): void => {
    try {
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true })
      }
    } catch {
      /* ignore cleanup errors */
    }
  }

  try {
    if (signal.aborted) {
      emit(win, { type: 'cancelled', jobId })
      return
    }

    // 1. Clone the specific branch directly — unless a working clone was provided
    //    (e.g. from the test-generator file-selection step).
    if (!reuseClone) {
      updateStatus(win, jobId, 'cloning')
      const credUrl = await injectGitCredentials(args.cloneUrl)
      try {
        await cloneRepo(credUrl, targetDir, args.branchName)
      } catch (cloneErr) {
        const raw = cloneErr instanceof Error ? cloneErr.message : String(cloneErr)
        const hint = explainGitAuthFailure(raw)
        throw new Error(hint ?? raw)
      }
    }

    let processedLabel: string
    let prComment: string | null = null

    if (args.type === 'test-generator') {
      processedLabel = await runTestGeneration(win, jobId, args, targetDir, signal, cleanupDir)
      if (processedLabel === '__cancelled__') return
    } else if (args.type === 'warning-corrector') {
      const outcome = await runWarningCorrection(win, jobId, args, targetDir, signal, cleanupDir)
      if (outcome.label === '__cancelled__') return
      processedLabel = outcome.label
      prComment = outcome.prComment
    } else {
      processedLabel = await runCommenting(win, jobId, args, targetDir, signal, cleanupDir)
      if (processedLabel === '__cancelled__') return
    }

    // 6. Commit
    if (signal.aborted) {
      cleanupDir()
      emit(win, { type: 'cancelled', jobId })
      return
    }
    updateStatus(win, jobId, 'committing')

    const branchKind =
      args.type === 'commentateur'
        ? 'comments'
        : args.type === 'warning-corrector'
          ? 'warnings'
          : 'tests'
    const newBranch = `tuleap-pet/${branchKind}-${randomBytes(3).toString('hex')}`
    await createBranch(targetDir, newBranch)
    await gitAdd(targetDir)
    await gitCommit(targetDir, processedLabel)

    // 7. Push
    if (signal.aborted) {
      cleanupDir()
      emit(win, { type: 'cancelled', jobId })
      return
    }
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
      // Warning-corrector: post the recap of corrected warnings as a PR comment,
      // exactly like the PR reviewer (POST /pull_requests/{id}/comments).
      if (prComment && prId != null) {
        try {
          await client.postPrComment(prId, prComment)
        } catch (commentErr) {
          debugError(
            '[job-manager] PR comment failed: %s',
            commentErr instanceof Error ? commentErr.message : String(commentErr)
          )
        }
      }
    } catch (prErr) {
      debugError(
        '[job-manager] PR creation failed: %s',
        prErr instanceof Error ? prErr.message : String(prErr)
      )
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

/** Sentinel returned by the per-type handlers when the job was cancelled mid-flight. */
const CANCELLED = '__cancelled__'

/**
 * Generate tests for an explicit selection of source files + functions
 * (granular call-graph pipeline only). Returns the commit message, or
 * {@link CANCELLED} if aborted.
 */
async function runTestGeneration(
  win: BrowserWindow | null,
  jobId: string,
  args: JobStartArgs,
  targetDir: string,
  signal: AbortSignal,
  cleanupDir: () => void
): Promise<string> {
  const selection = args.selection ?? []
  if (selection.length === 0) {
    throw new Error('Aucune fonction sélectionnée pour la génération de tests.')
  }

  const testDir = await findTestDirectory(targetDir)
  const outDir = testDir ? path.join(targetDir, testDir) : targetDir
  fs.mkdirSync(outDir, { recursive: true })

  updateStatus(win, jobId, 'processing')
  let produced = 0
  let failed = 0

  for (let i = 0; i < selection.length; i++) {
    if (signal.aborted) {
      cleanupDir()
      emit(win, { type: 'cancelled', jobId })
      return CANCELLED
    }
    const entry = selection[i]!
    emit(win, {
      type: 'progress',
      jobId,
      current: i + 1,
      total: selection.length,
      currentFile: entry.sourceFile
    })

    try {
      const fullPath = path.join(targetDir, entry.sourceFile)
      const content = fs.readFileSync(fullPath, 'utf8')
      const result = await generateTestsGranular(
        content,
        path.basename(entry.sourceFile),
        entry.functions.length > 0 ? entry.functions : undefined,
        undefined,
        targetDir,
        fullPath
      )
      // Prefix output names with the source basename to avoid collisions between
      // same-named functions in different files (e.g. two `init`).
      const sourceBase = path.basename(entry.sourceFile, path.extname(entry.sourceFile))
      for (const tf of result.testFiles) {
        const outName = `test_${sourceBase}_${tf.name.replace(/^test_/, '')}`
        fs.writeFileSync(path.join(outDir, outName), tf.content, 'utf8')
        produced++
      }
    } catch (fileErr) {
      failed++
      debugError(
        '[job-manager] test-gen failed for %s: %s',
        entry.sourceFile,
        fileErr instanceof Error ? fileErr.message : String(fileErr)
      )
    }
  }

  if (produced === 0) {
    throw new Error(
      'Aucun fichier de test généré pour la sélection (toutes les générations ont échoué).'
    )
  }

  return `[AI] Tests unitaires — ${produced} fichier(s)${failed > 0 ? `, ${failed} source(s) en échec` : ''}`
}

/**
 * Document an explicit selection of functions (header-driven, advanced pipeline
 * only): Doxygen brief above the declaration in the .h, and/or inline comments
 * inside the function body in the .c. Returns the commit message, or
 * {@link CANCELLED} if aborted.
 */
async function runCommenting(
  win: BrowserWindow | null,
  jobId: string,
  args: JobStartArgs,
  targetDir: string,
  signal: AbortSignal,
  cleanupDir: () => void
): Promise<string> {
  const targets = args.commentTargets ?? []
  if (targets.length === 0) {
    throw new Error('Aucune fonction sélectionnée à commenter.')
  }

  const commentHeader = args.options?.commentHeader ?? true
  const commentBody = args.options?.commentBody ?? false
  if (!commentHeader && !commentBody) {
    throw new Error('Sélectionnez au moins « commenter le header » ou « commenter le corps ».')
  }

  if (signal.aborted) {
    cleanupDir()
    emit(win, { type: 'cancelled', jobId })
    return CANCELLED
  }

  updateStatus(win, jobId, 'processing')

  const emitProgress = (ev: SelectiveCommentProgress): void => {
    if (ev.type === 'function') {
      emit(win, {
        type: 'progress',
        jobId,
        current: ev.index,
        total: ev.total,
        currentFile: ev.name
      })
    }
  }

  const result = await runSelectiveCommenter(
    targetDir,
    targets,
    {
      commentHeader,
      commentBody,
      depth: args.options?.contextDepth,
      tokenBudget: args.options?.contextTokenBudget
    },
    emitProgress
  )

  for (const w of result.warnings) {
    debugError('[job-manager] commenter warning: %s', w)
  }

  if (result.changedFiles.length === 0) {
    throw new Error(
      `Aucun commentaire généré (${result.failed} fonction(s) en échec). Rien à committer.`
    )
  }

  return `[AI] Commentaires Doxygen — ${result.commented} fonction(s)${
    result.failed > 0 ? `, ${result.failed} en échec` : ''
  }`
}

/**
 * Correct compiler warnings within an explicit function selection: run the repo's
 * `ai_compil` script, parse `warning.txt`, fix the in-scope warnings with code-tree
 * context, recompile and retry. Returns the commit message + a PR comment recap,
 * or {@link CANCELLED} as the label if aborted.
 */
async function runWarningCorrection(
  win: BrowserWindow | null,
  jobId: string,
  args: JobStartArgs,
  targetDir: string,
  signal: AbortSignal,
  cleanupDir: () => void
): Promise<{ label: string; prComment: string | null }> {
  const selection = args.selection ?? []
  if (selection.length === 0) {
    throw new Error('Aucune fonction sélectionnée pour la correction de warnings.')
  }

  if (signal.aborted) {
    cleanupDir()
    emit(win, { type: 'cancelled', jobId })
    return { label: CANCELLED, prComment: null }
  }

  updateStatus(win, jobId, 'processing')

  const emitProgress = (ev: WarningCorrectorProgress): void => {
    if (ev.type === 'fix') {
      emit(win, {
        type: 'progress',
        jobId,
        current: ev.index,
        total: ev.total,
        currentFile: ev.file
      })
    }
  }

  const result = await runWarningCorrector(
    targetDir,
    selection,
    { maxRetries: args.warningOptions?.maxRetries },
    emitProgress
  )

  for (const w of result.warnings) {
    debugError('[job-manager] warning-corrector: %s', w)
  }

  if (result.changedFiles.length === 0 || result.fixed.length === 0) {
    const detail =
      result.initialCount === 0
        ? (result.warnings[0] ?? 'Aucun warning à corriger dans la sélection.')
        : `0 warning corrigé sur ${result.initialCount} (${result.remaining.length} restant(s)).`
    throw new Error(`Aucune correction de warning à committer. ${detail}`)
  }

  const label = `[AI] Correction de warnings — ${result.fixed.length}/${result.initialCount} corrigé(s)${
    result.remaining.length > 0 ? `, ${result.remaining.length} restant(s)` : ''
  }`
  return { label, prComment: buildWarningPrSummary(result) }
}
