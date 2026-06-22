import fs from 'node:fs'
import path from 'node:path'
import { buildProjectIndex, buildContext, renderContext } from '../cpp-analyzer'
import type { FunctionDef, ProjectIndex } from '../cpp-analyzer/types'
import { resolveLlmProvider } from '../llm'
import { runCompileScript } from './compile-runner'
import { parseWarnings, groupByFile, warningKey, type Warning } from './warning-parser'
import { buildWarningFixPrompt, extractSourceBlock } from './warning-prompts'
import type { TestGenSelection } from '@shared/types'

export type WarningCorrectorOptions = {
  /** Number of recompile→correct retries allowed after the first pass (default 2). */
  maxRetries?: number
  /** BFS depth for the code-tree context (default 3). */
  depth?: number
  /** Token budget for the code-tree context (default 12000). */
  tokenBudget?: number
}

export type WarningCorrectorProgress =
  | { type: 'compile'; iteration: number }
  | { type: 'analyze'; iteration: number; matched: number; total: number }
  | { type: 'fix'; iteration: number; file: string; index: number; total: number }
  | { type: 'done' }

export type WarningCorrectorResult = {
  /** Absolute paths of files actually modified. */
  changedFiles: string[]
  /** Warnings present at baseline but gone after correction (within selection scope). */
  fixed: Warning[]
  /** Warnings still present after the last iteration (within selection scope). */
  remaining: Warning[]
  /** Number of in-scope warnings detected at baseline. */
  initialCount: number
  /** Correction passes performed. */
  iterations: number
  /** Non-fatal diagnostics (missing impl, LLM failures, …). */
  warnings: string[]
}

const norm = (p: string): string => p.replace(/\\/g, '/').replace(/^\.\//, '')

/**
 * Keep only the warnings whose file is part of the user's selection, refined to
 * the selected functions: a warning inside a *non-selected* function of a selected
 * file is dropped; a file-scope warning (outside any function) is kept. The
 * returned warnings have `relPath` rewritten to the matched selection file.
 */
export function matchWarnings(
  warnings: Warning[],
  selection: TestGenSelection[],
  index: ProjectIndex,
  cloneDir: string
): Warning[] {
  const byExact = new Set<string>()
  const byBase = new Map<string, string[]>()
  const fnsByFile = new Map<string, Set<string>>()
  for (const sel of selection) {
    const f = norm(sel.sourceFile)
    byExact.add(f)
    const base = f.split('/').pop()!
    const arr = byBase.get(base) ?? []
    arr.push(f)
    byBase.set(base, arr)
    fnsByFile.set(f, new Set(sel.functions))
  }

  const out: Warning[] = []
  for (const w of warnings) {
    const rel = norm(w.relPath)
    let matched: string | null = null
    if (byExact.has(rel)) {
      matched = rel
    } else {
      const base = rel.split('/').pop()!
      const cands = byBase.get(base) ?? []
      if (cands.length === 1) matched = cands[0]!
      else if (cands.length > 1)
        matched = cands.find((c) => rel.endsWith(c) || c.endsWith(rel)) ?? null
    }
    if (!matched) continue

    const selFns = fnsByFile.get(matched) ?? new Set<string>()
    const abs = path.resolve(cloneDir, matched)
    const defs = index.byFile.get(abs) ?? []
    if (selFns.size > 0 && w.line != null && defs.length > 0) {
      const containing = defs.find((d) => w.line! >= d.startLine && w.line! <= d.endLine)
      // Inside a function that the user did NOT select → out of scope.
      if (containing && !selFns.has(containing.name)) continue
    }
    out.push({ ...w, relPath: matched })
  }
  return out
}

/** Pick the functions to feed as code-tree context for a file's warnings. */
function contextTargets(
  index: ProjectIndex,
  abs: string,
  selFns: Set<string>,
  fileWarnings: Warning[]
): FunctionDef[] {
  const defs = index.byFile.get(abs) ?? []
  const targets: FunctionDef[] = []
  const seen = new Set<string>()
  for (const w of fileWarnings) {
    if (w.line == null) continue
    const c = defs.find((d) => w.line! >= d.startLine && w.line! <= d.endLine)
    if (c && !seen.has(c.qualifiedName)) {
      seen.add(c.qualifiedName)
      targets.push(c)
    }
  }
  if (targets.length === 0) {
    for (const d of defs) {
      if (selFns.has(d.name) && !seen.has(d.qualifiedName)) {
        seen.add(d.qualifiedName)
        targets.push(d)
      }
    }
  }
  return targets.slice(0, 6)
}

async function callLlm(system: string, user: string, maxOutputTokens = 8192): Promise<string> {
  const provider = resolveLlmProvider()
  const result = await provider.generate({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.2,
    maxOutputTokens
  })
  return result.text
}

function clampRetries(n: number | undefined): number {
  if (n == null || Number.isNaN(n)) return 2
  return Math.max(0, Math.min(5, Math.trunc(n)))
}

/**
 * Compile (via the repo's `ai_compil` script), correct the warnings that fall
 * within the user's selection using code-tree context, then recompile and retry
 * until clean or the retry budget is exhausted.
 */
export async function runWarningCorrector(
  cloneDir: string,
  selection: TestGenSelection[],
  options: WarningCorrectorOptions,
  onProgress?: (e: WarningCorrectorProgress) => void
): Promise<WarningCorrectorResult> {
  const emit = (e: WarningCorrectorProgress): void => onProgress?.(e)
  const diagnostics: string[] = []
  const changed = new Set<string>()
  const maxRetries = clampRetries(options.maxRetries)
  const fnsByFile = new Map<string, Set<string>>()
  for (const sel of selection) fnsByFile.set(norm(sel.sourceFile), new Set(sel.functions))

  // ── Baseline compile + scope ──────────────────────────────────────────────
  emit({ type: 'compile', iteration: 0 })
  const baselineRun = await runCompileScript(cloneDir)
  let index = buildProjectIndex(cloneDir)
  const baselineParsed = parseWarnings(baselineRun.warningText, cloneDir)
  const baselineMatched = matchWarnings(baselineParsed, selection, index, cloneDir)
  emit({
    type: 'analyze',
    iteration: 0,
    matched: baselineMatched.length,
    total: baselineParsed.length
  })

  if (baselineMatched.length === 0) {
    emit({ type: 'done' })
    return {
      changedFiles: [],
      fixed: [],
      remaining: [],
      initialCount: 0,
      iterations: 0,
      warnings:
        baselineParsed.length > 0
          ? ['Des warnings existent mais aucun ne concerne les fonctions sélectionnées.']
          : ['Aucun warning détecté dans warning.txt.']
    }
  }

  // ── Correction loop ───────────────────────────────────────────────────────
  let current = baselineMatched
  let iterations = 0
  for (let i = 1; i <= 1 + maxRetries; i++) {
    iterations = i
    index = buildProjectIndex(cloneDir)
    const grouped = [...groupByFile(current).entries()]

    for (let f = 0; f < grouped.length; f++) {
      const [relFile, fileWarnings] = grouped[f]!
      emit({ type: 'fix', iteration: i, file: relFile, index: f + 1, total: grouped.length })
      const abs = path.resolve(cloneDir, relFile)
      let content: string
      try {
        content = fs.readFileSync(abs, 'utf8')
      } catch (err) {
        diagnostics.push(`${relFile}: lecture impossible (${(err as Error).message}).`)
        continue
      }
      const selFns = fnsByFile.get(relFile) ?? new Set<string>()
      const targets = contextTargets(index, abs, selFns, fileWarnings)
      const contextText = targets
        .map((t) =>
          renderContext(
            buildContext(index, t, { depth: options.depth, tokenBudget: options.tokenBudget })
          )
        )
        .join('\n\n')

      try {
        const { system, user } = buildWarningFixPrompt({
          fileName: relFile,
          fileContent: content,
          warnings: fileWarnings,
          contextText
        })
        const corrected = extractSourceBlock(await callLlm(system, user))
        if (corrected.trim() && corrected !== content) {
          fs.writeFileSync(abs, corrected, 'utf8')
          changed.add(abs)
        }
      } catch (err) {
        diagnostics.push(`${relFile}: correction IA échouée (${(err as Error).message}).`)
      }
    }

    // Recompile and re-scope.
    emit({ type: 'compile', iteration: i })
    const run = await runCompileScript(cloneDir)
    const afterIndex = buildProjectIndex(cloneDir)
    current = matchWarnings(
      parseWarnings(run.warningText, cloneDir),
      selection,
      afterIndex,
      cloneDir
    )
    emit({ type: 'analyze', iteration: i, matched: current.length, total: current.length })
    if (current.length === 0) break
  }

  // ── Establish correspondences: fixed = baseline − remaining (by key) ───────
  const remainingKeys = new Set(current.map(warningKey))
  const fixed = baselineMatched.filter((w) => !remainingKeys.has(warningKey(w)))

  emit({ type: 'done' })
  return {
    changedFiles: [...changed],
    fixed,
    remaining: current,
    initialCount: baselineMatched.length,
    iterations,
    warnings: diagnostics
  }
}

/** Build the Markdown recap posted as a PR comment listing the corrected warnings. */
export function buildWarningPrSummary(result: WarningCorrectorResult): string {
  const lines: string[] = []
  lines.push('## 🛠️ Correcteur de warnings — récapitulatif')
  lines.push('')
  lines.push(
    `**${result.fixed.length}/${result.initialCount}** warning(s) corrigé(s) en ` +
      `${result.iterations} itération(s) sur ${result.changedFiles.length} fichier(s).`
  )

  if (result.fixed.length > 0) {
    lines.push('')
    lines.push('### ✅ Warnings corrigés')
    for (const [file, ws] of groupByFile(result.fixed)) {
      lines.push('')
      lines.push(`- \`${file}\``)
      for (const w of ws) {
        const cat = w.category && w.category !== 'unknown' ? ` \`${w.category}\`` : ''
        lines.push(`  - ${cat ? cat + ' — ' : ''}${w.message}`)
      }
    }
  }

  if (result.remaining.length > 0) {
    lines.push('')
    lines.push(`### ⚠️ Warnings restants (${result.remaining.length})`)
    for (const [file, ws] of groupByFile(result.remaining)) {
      lines.push('')
      lines.push(`- \`${file}\``)
      for (const w of ws.slice(0, 20)) {
        const loc = w.line != null ? `:${w.line}` : ''
        const cat = w.category && w.category !== 'unknown' ? ` \`${w.category}\`` : ''
        lines.push(`  - ${file}${loc}${cat} — ${w.message}`)
      }
    }
  }

  lines.push('')
  lines.push('_Généré automatiquement par Tuleap AI Companion._')
  return lines.join('\n')
}
