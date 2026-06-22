import fs from 'node:fs'
import path from 'node:path'
import { buildProjectIndex, buildContext, renderContext } from '../cpp-analyzer'
import type { FunctionDef, ProjectIndex } from '../cpp-analyzer/types'
import { resolveLlmProvider } from '../llm'
import { runCompileScript, findCompileScripts, findNearestScript } from './compile-runner'
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

/** Number of trailing path segments shared by two (already forward-slashed) paths. */
function sharedSuffixSegments(a: string, b: string): number {
  const sa = a.toLowerCase().split('/').filter(Boolean)
  const sb = b.toLowerCase().split('/').filter(Boolean)
  let i = sa.length - 1
  let j = sb.length - 1
  let n = 0
  while (i >= 0 && j >= 0 && sa[i] === sb[j]) {
    n++
    i--
    j--
  }
  return n
}

/**
 * Find the selected source file that best matches a compiler-reported path by the
 * longest shared trailing path segments (case-insensitive, separator/space
 * tolerant). A single shared segment (the basename) is enough; longer overlaps win
 * to disambiguate same-named files. Returns the selection file or null.
 */
export function bestSelectionMatch(warnPath: string, selectionFiles: string[]): string | null {
  const p = norm(warnPath)
  let best: string | null = null
  let bestScore = 0
  for (const f of selectionFiles) {
    const score = sharedSuffixSegments(p, norm(f))
    if (score > bestScore) {
      bestScore = score
      best = f
    }
  }
  return bestScore >= 1 ? best : null
}

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
  const selFiles = selection.map((sel) => norm(sel.sourceFile))
  const fnsByFile = new Map<string, Set<string>>()
  for (const sel of selection) fnsByFile.set(norm(sel.sourceFile), new Set(sel.functions))

  const out: Warning[] = []
  for (const w of warnings) {
    const matched = bestSelectionMatch(w.relPath, selFiles)
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
 * Resolve which compile scripts to run for a selection. With a single script we
 * always use it; with several, we run the one *nearest* to each selected file
 * (deepest ancestor `ai_compil`), deduplicated. Throws when none is found.
 */
export function resolveScriptsForSelection(
  cloneDir: string,
  selection: TestGenSelection[]
): string[] {
  const all = findCompileScripts(cloneDir)
  if (all.length === 0) {
    throw new Error(
      "Aucun script de compilation 'ai_compil.sh'/'ai_compil.bat' trouvé dans le dépôt."
    )
  }
  if (all.length === 1) return all

  const chosen = new Set<string>()
  for (const sel of selection) {
    const fileAbs = path.resolve(cloneDir, sel.sourceFile)
    const near = findNearestScript(fileAbs, all)
    if (near) chosen.add(near)
  }
  // Fallback: the shallowest (root-most) script when nothing matched.
  if (chosen.size === 0) chosen.add(all[0]!)
  return [...chosen]
}

/**
 * Run each resolved script and merge the parsed warnings. Each script's output
 * is parsed with its own directory as the base so relative paths resolve to the
 * correct clone-relative file. Duplicates are collapsed by warning key.
 */
async function compileAndParse(scripts: string[], cloneDir: string): Promise<Warning[]> {
  const merged: Warning[] = []
  const seen = new Set<string>()
  for (const scriptPath of scripts) {
    const run = await runCompileScript(cloneDir, { scriptPath })
    for (const w of parseWarnings(run.warningText, cloneDir, run.scriptDir)) {
      const k = warningKey(w)
      if (seen.has(k)) continue
      seen.add(k)
      merged.push(w)
    }
  }
  return merged
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

  // Resolve which compile script(s) to run: nearest to each selected file.
  const scripts = resolveScriptsForSelection(cloneDir, selection)

  // ── Baseline compile + scope ──────────────────────────────────────────────
  emit({ type: 'compile', iteration: 0 })
  const baselineParsed = await compileAndParse(scripts, cloneDir)
  let index = buildProjectIndex(cloneDir)
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
    const afterParsed = await compileAndParse(scripts, cloneDir)
    const afterIndex = buildProjectIndex(cloneDir)
    current = matchWarnings(afterParsed, selection, afterIndex, cloneDir)
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
  lines.push('## Correcteur de warnings — récapitulatif')
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
  return stripAstral(lines.join('\n'))
}

/**
 * Remove astral-plane characters (code points > U+FFFF, i.e. 4-byte UTF-8 such as
 * 🛠 / 🚀 emoji). Tuleap rejects them with HTTP 500 when its DB columns are plain
 * `utf8` (3-byte) instead of `utf8mb4`. BMP symbols (✅ ⚠️ …) are kept as-is.
 */
export function stripAstral(s: string): string {
  return s.replace(/[\u{10000}-\u{10FFFF}]/gu, '')
}
