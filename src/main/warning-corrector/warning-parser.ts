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

// MSVC:  path(line): warning Cxxxx: message
//        path(line,col): warning Cxxxx: message
const MSVC_RE = /^\s*(.+?)\((\d+)(?:,(\d+))?\)\s*:\s*warning\s+([A-Z]\d+)\s*:\s*(.*?)\s*$/i

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/').trim()
}

/** Make `filePath` relative to `cloneDir` when it lives under it; else keep basename-anchored. */
function toRelPath(filePath: string, cloneDir: string): string {
  const norm = normalizeSlashes(filePath)
  if (path.isAbsolute(norm) && cloneDir) {
    const rel = path.relative(cloneDir, norm).replace(/\\/g, '/')
    if (rel && !rel.startsWith('..')) return rel
  }
  // Already relative (possibly prefixed with ./ or a build subdir) — strip leading ./
  return norm.replace(/^\.\//, '')
}

/**
 * Parse a `warning.txt` log into structured warnings. Supports GCC/Clang and
 * MSVC formats. Duplicate lines are collapsed. `cloneDir` (optional) lets us
 * resolve absolute compiler paths to clone-relative ones for selection matching.
 */
export function parseWarnings(text: string, cloneDir = ''): Warning[] {
  const out: Warning[] = []
  const seen = new Set<string>()
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd()
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
      message = m[5]!.trim()
    }

    const norm = normalizeSlashes(filePath)
    const relPath = toRelPath(filePath, cloneDir)
    const w: Warning = {
      filePath: norm,
      relPath,
      line: lineNo,
      column,
      category,
      message,
      raw: line.trim()
    }
    const key = `${w.relPath}|${w.category}|${w.message}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(w)
  }
  return out
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
 * Stable identity for a warning across recompilations. Deliberately excludes the
 * line/column because corrective edits shift line numbers; the file + category +
 * message triple is what we track to decide whether a warning was corrected.
 */
export function warningKey(w: Warning): string {
  return `${w.relPath}|${w.category}|${w.message}`
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
