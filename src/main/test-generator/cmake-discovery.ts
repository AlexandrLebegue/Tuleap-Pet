import fs from 'node:fs'
import path from 'node:path'

export type CMakeInsertionMode =
  | { kind: 'add_executable'; target: string }
  | { kind: 'target_sources'; target: string }
  | { kind: 'append'; target: null }

export type CMakeDiscovery = {
  /** Absolute path of the CMakeLists.txt that owns the template test file. */
  cmakeFile: string | null
  /** Where the existing test file is referenced and where new sources should go. */
  mode: CMakeInsertionMode | null
  /** Pre-existing source list as written in the CMakeLists block (for diagnostics). */
  existingSources: string[]
}

/**
 * Locate the `CMakeLists.txt` responsible for the given test file. Strategy:
 * walk up the directory tree from `testFilePath` looking at each `CMakeLists.txt`;
 * the first one that mentions the test file's basename (in any form) wins.
 * Falls back to the closest `CMakeLists.txt` even when no mention is found —
 * the caller can decide whether to use it.
 */
export function discoverCMake(testFilePath: string, projectRoot: string): CMakeDiscovery {
  const abs = path.resolve(testFilePath)
  const rootAbs = path.resolve(projectRoot)
  const fileBase = path.basename(abs)
  let dir = path.dirname(abs)
  let fallback: string | null = null

  while (true) {
    const candidate = path.join(dir, 'CMakeLists.txt')
    if (fs.existsSync(candidate)) {
      if (!fallback) fallback = candidate
      let content: string
      try {
        content = fs.readFileSync(candidate, 'utf8')
      } catch {
        content = ''
      }
      if (content.includes(fileBase)) {
        return {
          cmakeFile: candidate,
          mode: detectInsertionMode(content, fileBase),
          existingSources: extractExistingSources(content, fileBase)
        }
      }
    }
    if (dir === rootAbs || dir === path.dirname(dir)) break
    dir = path.dirname(dir)
  }

  // No CMakeLists mentions the file directly. Return the nearest CMakeLists
  // we encountered (if any) with a default append mode — the updater can
  // still produce a usable change.
  if (fallback) {
    let content = ''
    try {
      content = fs.readFileSync(fallback, 'utf8')
    } catch {
      // ignore
    }
    return {
      cmakeFile: fallback,
      mode: { kind: 'append', target: null },
      existingSources: extractExistingSources(content, null)
    }
  }
  return { cmakeFile: null, mode: null, existingSources: [] }
}

/**
 * Return a list of source filenames currently referenced inside the
 * `add_executable` or `target_sources` block that mentions `fileBase`. If
 * `fileBase` is null, scans every block and returns the longest source list
 * found.
 */
function extractExistingSources(content: string, fileBase: string | null): string[] {
  const blocks = extractCMakeBlocks(content)
  const matching = fileBase
    ? blocks.filter((b) => b.body.includes(fileBase))
    : blocks
  let best: string[] = []
  for (const b of matching) {
    const sources = parseSourcesFromBlock(b.body)
    if (sources.length > best.length) best = sources
  }
  return best
}

function detectInsertionMode(content: string, fileBase: string): CMakeInsertionMode {
  const blocks = extractCMakeBlocks(content)
  for (const b of blocks) {
    if (!b.body.includes(fileBase)) continue
    if (b.command === 'add_executable') {
      const target = parseFirstArg(b.body)
      if (target) return { kind: 'add_executable', target }
    }
    if (b.command === 'target_sources') {
      const target = parseFirstArg(b.body)
      if (target) return { kind: 'target_sources', target }
    }
  }
  return { kind: 'append', target: null }
}

type CMakeBlock = { command: string; body: string; start: number; end: number }

/**
 * Tokenizes a CMakeLists.txt looking for `add_executable`/`target_sources`
 * blocks. Returns the body (text between `(` and the matching `)`) along
 * with start/end offsets so the updater can do a precise replacement.
 */
export function extractCMakeBlocks(content: string): CMakeBlock[] {
  const out: CMakeBlock[] = []
  const re = /\b(add_executable|target_sources)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const command = m[1]!
    const start = m.index
    const openParenIdx = re.lastIndex - 1
    let i = openParenIdx + 1
    let depth = 1
    while (i < content.length && depth > 0) {
      const ch = content[i]
      if (ch === '(') depth++
      else if (ch === ')') depth--
      if (depth === 0) break
      i++
    }
    if (depth !== 0) continue
    const body = content.slice(openParenIdx + 1, i)
    out.push({ command, body, start, end: i + 1 })
    re.lastIndex = i + 1
  }
  return out
}

function parseFirstArg(body: string): string | null {
  const trimmed = body.trim()
  if (!trimmed) return null
  const m = trimmed.match(/^([A-Za-z_][\w-]*)/)
  return m?.[1] ?? null
}

function parseSourcesFromBlock(body: string): string[] {
  const sources: string[] = []
  const tokens = body
    .replace(/\$\{[^}]*\}/g, '')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
  for (const t of tokens) {
    if (/\.(c|cc|cpp|cxx|c\+\+)$/i.test(t)) sources.push(t)
  }
  return sources
}
