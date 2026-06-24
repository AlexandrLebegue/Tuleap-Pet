import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { getConfig } from '../store/config'
import { buildHeaderIndex } from '../test-generator/header-index'
import { runSelectiveCommenter } from '../commenter/selective-commenter'
import type { SelectiveCommentProgress } from '../commenter/selective-commenter'
import { svnCheckout, svnDiff, SvnError } from './svn-utils'
import { buildSvnAuthArgs, explainSvnAuthFailure } from './svn-credentials'
import { debugError } from '../logger'
import type { HeaderEntry, CommentTarget, SvnPatchResult } from '@shared/types'

export type SvnCheckoutResult =
  | { ok: true; workDir: string; revision: number | null; headers: HeaderEntry[] }
  | { ok: false; error: string }

/**
 * Checkout an SVN path (trunk / a branch) into the temp folder and build the
 * header→functions index used by the function picker. The working copy is reused
 * by {@link generateSvnPatch} and cleaned up afterwards.
 */
export async function checkoutAndIndex(
  svnUrl: string,
  repoName: string
): Promise<SvnCheckoutResult> {
  const { tempClonePath } = getConfig()
  if (!tempClonePath) {
    return { ok: false, error: 'Aucun dossier temporaire configuré dans les réglages.' }
  }
  const safeName = repoName.replace(/[^\w.-]+/g, '_')
  const workDir = path.join(tempClonePath, `${safeName}_svn_${randomBytes(3).toString('hex')}`)
  try {
    const authArgs = await buildSvnAuthArgs(svnUrl)
    const revision = await svnCheckout(svnUrl, workDir, authArgs)
    const headers = buildHeaderIndex(workDir)
    return { ok: true, workDir, revision, headers }
  } catch (err) {
    cleanupWorkDir(workDir)
    const raw = err instanceof SvnError ? err.stderr || err.message : String(err)
    return {
      ok: false,
      error: explainSvnAuthFailure(raw) ?? (err instanceof Error ? err.message : raw)
    }
  }
}

/**
 * Run the selective commenter over an SVN working copy and return the resulting
 * unified diff — **without committing anything**. This is the "generate a patch"
 * workflow: the user applies the patch themselves via TortoiseSVN.
 */
export async function generateSvnPatch(
  workDir: string,
  targets: CommentTarget[],
  options: { commentHeader: boolean; commentBody: boolean; depth?: number },
  onProgress?: (e: SelectiveCommentProgress) => void
): Promise<SvnPatchResult> {
  if (!fs.existsSync(workDir)) {
    throw new Error('Working copy SVN introuvable (checkout expiré ?).')
  }
  if (targets.length === 0) {
    throw new Error('Aucune fonction sélectionnée à commenter.')
  }
  if (!options.commentHeader && !options.commentBody) {
    throw new Error('Sélectionnez au moins « commenter le header » ou « commenter le corps ».')
  }

  const result = await runSelectiveCommenter(
    workDir,
    targets,
    {
      commentHeader: options.commentHeader,
      commentBody: options.commentBody,
      depth: options.depth
    },
    onProgress
  )

  for (const w of result.warnings) {
    debugError('[svn-patch] commenter warning: %s', w)
  }

  const patch = result.changedFiles.length > 0 ? await svnDiff(workDir) : ''
  const changedFiles = result.changedFiles.map((abs) =>
    path.relative(workDir, abs).split(path.sep).join('/')
  )

  return {
    patch,
    changedFiles,
    commented: result.commented,
    failed: result.failed,
    warnings: result.warnings
  }
}

/** Best-effort removal of an SVN working copy. */
export function cleanupWorkDir(dir: string): void {
  try {
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}
