import fs from 'node:fs'
import path from 'node:path'
import { buildProjectIndex, buildContext, renderContext, findFunction } from '../cpp-analyzer'
import type { ProjectIndex, FunctionDef } from '../cpp-analyzer/types'
import { findExistingCommentRange, detectFunctionIndent } from './comment-locator'
import {
  buildGeneratePrompt,
  buildInlineCommentPrompt,
  extractCommentBlock,
  callLlm,
  applyOps,
  type Op
} from './context-commenter'
import { debugError } from '../logger'
import type { CommentTarget } from '@shared/types'

export type SelectiveCommentOptions = {
  /** Generate the Doxygen brief above the declaration in the header. */
  commentHeader: boolean
  /** Add inline comments inside the function body (implementation file). */
  commentBody: boolean
  depth?: number
  tokenBudget?: number
}

export type SelectiveCommentProgress =
  | { type: 'index'; root: string }
  | { type: 'function'; name: string; index: number; total: number }
  | { type: 'done' }

export type SelectiveCommentResult = {
  /** Absolute paths of files actually modified. */
  changedFiles: string[]
  /** Number of targets for which at least one comment was produced. */
  commented: number
  failed: number
  warnings: string[]
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Remove any leading comment block(s) / blank lines that appear *before* the
 * function signature. The body pass must only add comments INSIDE the function;
 * a brief block above the function belongs in the header, never in the .c.
 */
export function stripLeadingDoxygen(code: string): string {
  const lines = code.split('\n')
  let i = 0
  const isBlank = (l: string): boolean => l.trim() === ''
  while (i < lines.length) {
    const t = (lines[i] ?? '').trim()
    if (isBlank(t)) {
      i++
      continue
    }
    if (t.startsWith('/*')) {
      // Consume the whole block comment (e.g. the /*---*/ + /*! \brief ... */ header).
      while (i < lines.length && !(lines[i] ?? '').includes('*/')) i++
      if (i < lines.length) i++
      continue
    }
    if (t.startsWith('//')) {
      i++
      continue
    }
    break // first line of actual code (the signature)
  }
  return lines.slice(i).join('\n')
}

/**
 * Locate the line (1-based) of a function *declaration* inside a header. The
 * cpp-analyzer parser only extracts definitions (with a body), so a function
 * implemented in a .c file has no parsed entry in its .h — we find its prototype
 * heuristically: a statement mentioning `<name>(` that terminates with `;`
 * before any `{`.
 */
export function findHeaderDeclLine(headerContent: string, fnName: string): number | null {
  const lines = headerContent.split('\n')
  const nameRe = new RegExp(`\\b${escapeRegExp(fnName)}\\s*\\(`)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (!nameRe.test(line)) continue
    // Accumulate the logical statement to decide declaration (`;`) vs definition (`{`).
    let buf = ''
    for (let j = i; j < lines.length && j < i + 12; j++) {
      buf += (lines[j] ?? '') + '\n'
      const brace = buf.indexOf('{')
      const semi = buf.indexOf(';')
      if (brace !== -1 && (semi === -1 || brace < semi)) break // definition, not a decl
      if (semi !== -1) return i + 1 // declaration starts at line i (1-based)
    }
  }
  return null
}

/** Find the definition for a target, preferring the recorded implementation file. */
function resolveDef(
  index: ProjectIndex,
  cloneDir: string,
  target: CommentTarget
): FunctionDef | null {
  const implAbs = path.resolve(cloneDir, target.implFile)
  return findFunction(index, target.name, implAbs)
}

type FileEdits = { content: string; ops: Op[] }

/**
 * Document an explicit selection of functions:
 *  - the Doxygen brief block is inserted above the declaration in the header;
 *  - inline body comments are added inside the implementation (.c) function.
 * Either or both can be enabled. Targets/paths are relative to `cloneDir`.
 */
export async function runSelectiveCommenter(
  cloneDir: string,
  targets: CommentTarget[],
  options: SelectiveCommentOptions,
  onProgress?: (e: SelectiveCommentProgress) => void
): Promise<SelectiveCommentResult> {
  const emit = (e: SelectiveCommentProgress): void => onProgress?.(e)
  emit({ type: 'index', root: cloneDir })
  const index = buildProjectIndex(cloneDir)

  // Accumulate edits per absolute file so multiple functions in the same file
  // are spliced in a single pass (line numbers stay valid).
  const edits = new Map<string, FileEdits>()
  const warnings: string[] = []
  let commented = 0
  let failed = 0

  const editsFor = (abs: string): FileEdits => {
    let e = edits.get(abs)
    if (!e) {
      e = { content: fs.readFileSync(abs, 'utf8'), ops: [] }
      edits.set(abs, e)
    }
    return e
  }

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]!
    emit({ type: 'function', name: target.name, index: i + 1, total: targets.length })

    const def = resolveDef(index, cloneDir, target)
    if (!def) {
      warnings.push(`${target.name}: implémentation introuvable (${target.implFile}).`)
      failed++
      continue
    }

    let producedForTarget = false

    // 1. Brief above the declaration in the header.
    if (options.commentHeader) {
      try {
        const headerAbs = path.resolve(cloneDir, target.headerPath)
        const headerEdit = editsFor(headerAbs)
        const declLine = target.inHeader
          ? def.startLine
          : findHeaderDeclLine(headerEdit.content, target.name)
        if (declLine == null) {
          warnings.push(`${target.name}: déclaration introuvable dans ${target.headerPath}.`)
        } else {
          const context = buildContext(index, def, {
            depth: options.depth,
            tokenBudget: options.tokenBudget
          })
          const indent = detectFunctionIndent(headerEdit.content, declLine)
          const { system, user } = buildGeneratePrompt({
            fn: def,
            ctxText: renderContext(context),
            indent
          })
          const brief = extractCommentBlock(await callLlm(system, user))
          const existing = findExistingCommentRange(headerEdit.content, declLine)
          if (existing) {
            headerEdit.ops.push({
              startLine: existing.startLine - 1,
              endLineExclusive: existing.endLine,
              replacement: brief
            })
          } else {
            headerEdit.ops.push({
              startLine: declLine - 1,
              endLineExclusive: declLine - 1,
              replacement: brief
            })
          }
          producedForTarget = true
        }
      } catch (err) {
        warnings.push(
          `${target.name} (header): ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }

    // 2. Inline comments inside the function body (implementation file).
    if (options.commentBody) {
      try {
        // def.filePath is the absolute file the parser read the body from.
        const implEdit = editsFor(def.filePath)
        const { system, user } = buildInlineCommentPrompt(def.body)
        // Strip any function-level brief the LLM may have prepended: the .c keeps
        // ONLY in-body comments — the brief lives in the header.
        const commentedBody = stripLeadingDoxygen(
          extractCommentBlock(await callLlm(system, user, 4096))
        )
        implEdit.ops.push({
          startLine: def.startLine - 1,
          endLineExclusive: def.endLine,
          replacement: commentedBody
        })
        producedForTarget = true
      } catch (err) {
        warnings.push(`${target.name} (corps): ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (producedForTarget) commented++
    else failed++
  }

  // Apply and write each modified file once.
  const changedFiles: string[] = []
  for (const [abs, edit] of edits) {
    if (edit.ops.length === 0) continue
    try {
      const next = applyOps(edit.content, edit.ops)
      if (next !== edit.content) {
        fs.writeFileSync(abs, next, 'utf8')
        changedFiles.push(abs)
      }
    } catch (err) {
      debugError(
        '[selective-commenter] failed to write %s: %s',
        abs,
        err instanceof Error ? err.message : String(err)
      )
      warnings.push(
        `${abs}: écriture impossible (${err instanceof Error ? err.message : String(err)}).`
      )
    }
  }

  emit({ type: 'done' })
  return { changedFiles, commented, failed, warnings }
}
