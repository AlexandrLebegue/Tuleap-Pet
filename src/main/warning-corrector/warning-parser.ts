import path from 'node:path'

/** A single compiler warning, normalized for matching and diffing. */
export type Warning = {
  /** File path as reported by the compiler, normalized to forward slashes. */
  filePath: string
  /** Same path made relative to the clone dir when possible (forward slashes). */
  relPath: string
  line: number | null
  column: number | null
  /** Warning category, e.g. `-Wunused-variable` (GCC/Clang) or `C4101` (MSVC). */
  category: string
  message: string
  /**
   * 0-based ordinal among warnings sharing the same (file, category, message).
   * Used as a stable identity that survives line shifts caused by corrective
   * edits, so several identical messages in one file are tracked separately.
   */
  occurrence: number
  /** Original line of text the warning was parsed from. */
  raw: string
}

export type WarningDiff = {
  /** Warnings present before but gone after — i.e. corrected. */
  fixed: Warning[]
  /** Warnings present both before and after — still failing. */
  remaining: Warning[]
  /** Warnings only present after — regressions introduced by the edits. */
  introduced: Warning[]
}

// GCC / Clang:  path:line:col: warning: message [-Wflag]
//               path:line: warning: message
const GCC_RE = /^\s*(.+?):(\d+)(?::(\d+))?:\s*warning:\s*(.*?)\s*(?:\[([^\]]+)\])?\s*$/i

// MSVC:  path(line): warning Cxxxx: message      (path may contain spaces)
//        path(line,col): warning Cxxxx: message
const MSVC_RE = /^\s*(.+?)\((\d+)(?:,(\d+))?\)\s*:\s*warning\s+([A-Z]+\d+)\s*:\s*(.*?)\s*$/i

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/').trim()
}

/**
 * Remove the trailing MSBuild project tag MSVC appends to each diagnostic, e.g.
 * ` [P:\proj\build\ci-msvc\libdscom.vcxproj]`. Only stripped when it looks like a
 * project file path so we never eat a legitimate trailing `[...]` in a message.
 */
function stripMsbuildProjectTag(message: string): string {
  return message.replace(/\s*\[[^\]]*\.(?:vcx?proj|csproj|sln)\]\s*$/i, '').trimEnd()
}

/**
 * Make `filePath` relative to `cloneDir`. Absolute paths are made relative to the
 * clone; relative paths are first anchored at `baseDir` (the directory the
 * compile script ran from, e.g. a sub-module) so warnings emitted by a nested
 * `ai_compil` resolve to the right clone-relative file. Build paths that live
 * outside the clone (e.g. an absolute `P:\…` from another machine) are returned
 * normalized as-is; suffix matching in `matchWarnings` handles those.
 */
function toRelPath(filePath: string, cloneDir: string, baseDir: string): string {
  const norm = normalizeSlashes(filePath)
  // Windows-style absolute paths (`P:/…`) are not detected by POSIX path.isAbsolute,
  // so test for a drive letter explicitly too.
  const isWinAbs = /^[a-zA-Z]:\//.test(norm)
  if (path.isAbsolute(norm) || isWinAbs) {
    if (cloneDir && !isWinAbs) {
      const rel = path.relative(cloneDir, norm).replace(/\\/g, '/')
      if (rel && !rel.startsWith('..')) return rel
    }
    return norm
  }
  const stripped = norm.replace(/^\.\//, '')
  if (baseDir && cloneDir) {
    const abs = path.resolve(baseDir, stripped)
    const rel = path.relative(cloneDir, abs).replace(/\\/g, '/')
    if (rel && !rel.startsWith('..')) return rel
  }
  return stripped
}

/**
 * Parse a `warning.txt` log into structured warnings. Supports GCC/Clang and
 * MSVC formats.
 *
 * MSVC (with `/diagnostics:caret`) prints three lines per warning at the same
 * location — the message, the offending source line, then a caret — all sharing
 * the `(line,col): warning Cxxxx:` prefix. We collapse them by location, keeping
 * the first (the real message). The MSBuild `NN>` node prefix and trailing
 * ` [project.vcxproj]` tag are stripped.
 *
 * `cloneDir` resolves absolute compiler paths to clone-relative ones; `baseDir`
 * (defaults to `cloneDir`) anchors relative paths to the directory the script ran
 * from.
 */
export function parseWarnings(text: string, cloneDir = '', baseDir = cloneDir): Warning[] {
  type Parsed = Omit<Warning, 'occurrence'>
  const parsed: Parsed[] = []
  const seenLoc = new Set<string>()

  for (const rawLine of text.split(/\r?\n/)) {
    // Strip the MSBuild parallel-build node prefix ("12>...") and trailing spaces.
    const line = rawLine.replace(/^\s*\d+>/, '').replace(/\s+$/, '')
    if (!line) continue

    let filePath: string | null = null
    let lineNo: number | null = null
    let column: number | null = null
    let category = 'unknown'
    let message = ''

    const g = GCC_RE.exec(line)
    if (g) {
      filePath = g[1]!
      lineNo = Number.parseInt(g[2]!, 10)
      column = g[3] ? Number.parseInt(g[3], 10) : null
      message = g[4]!.trim()
      if (g[5]) category = g[5].trim()
    } else {
      const m = MSVC_RE.exec(line)
      if (!m) continue
      filePath = m[1]!
      lineNo = Number.parseInt(m[2]!, 10)
      column = m[3] ? Number.parseInt(m[3], 10) : null
      category = m[4]!.trim()
      message = stripMsbuildProjectTag(m[5]!.trim())
    }

    const norm = normalizeSlashes(filePath)
    const relPath = toRelPath(filePath, cloneDir, baseDir)

    // Collapse the caret / source-context lines MSVC prints at the same location.
    const locKey = `${norm}|${lineNo}|${column}|${category}`
    if (seenLoc.has(locKey)) continue
    seenLoc.add(locKey)

    parsed.push({
      filePath: norm,
      relPath,
      line: lineNo,
      column,
      category,
      message,
      raw: line.trim()
    })
  }

  // Assign a stable occurrence ordinal per (relPath, category, message) so that
  // identical messages on different lines are kept as distinct warnings.
  const occ = new Map<string, number>()
  return parsed.map((p) => {
    const base = `${p.relPath}|${p.category}|${p.message}`
    const occurrence = occ.get(base) ?? 0
    occ.set(base, occurrence + 1)
    return { ...p, occurrence }
  })
}

/** Group warnings by their clone-relative file path. */
export function groupByFile(warnings: Warning[]): Map<string, Warning[]> {
  const map = new Map<string, Warning[]>()
  for (const w of warnings) {
    const arr = map.get(w.relPath)
    if (arr) arr.push(w)
    else map.set(w.relPath, [w])
  }
  return map
}

/**
 * Stable identity for a warning across recompilations. Excludes the line/column
 * (corrective edits shift them); identical messages in the same file are kept
 * distinct via their occurrence ordinal.
 */
export function warningKey(w: Warning): string {
  return `${w.relPath}|${w.category}|${w.message}|${w.occurrence}`
}

/** Compare two warning sets (same scope) to find what was fixed / remains / introduced. */
export function diffWarnings(before: Warning[], after: Warning[]): WarningDiff {
  const afterKeys = new Set(after.map(warningKey))
  const beforeKeys = new Set(before.map(warningKey))
  const fixed: Warning[] = []
  for (const w of before) {
    if (!afterKeys.has(warningKey(w))) fixed.push(w)
  }
  const remaining: Warning[] = []
  const introduced: Warning[] = []
  for (const w of after) {
    if (beforeKeys.has(warningKey(w))) remaining.push(w)
    else introduced.push(w)
  }
  return { fixed, remaining, introduced }
}
