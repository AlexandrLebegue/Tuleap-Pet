import fs from 'node:fs'
import path from 'node:path'
import { parseFile } from './parser'
import { extractCallees } from './callExtractor'
import { isCppFile } from './pairing'
import type { CallSite, FunctionDef, ProjectIndex } from './types'

const SKIP_DIRS = new Set([
  '.git', '.svn', '.hg',
  'node_modules', 'dist', 'out', 'build', 'cmake-build', 'cmake-build-debug', 'cmake-build-release',
  '_deps', 'CMakeFiles',
  '.cache', '.idea', '.vscode', '.vs',
  'third_party', 'external', 'vendor', 'extern' // commonly used for vendored libs
])

const MAX_FILE_BYTES = 2 * 1024 * 1024 // 2 MiB — skip absurdly large generated files

export type IndexOptions = {
  /** Extra directory names (basenames) to skip in addition to the defaults. */
  extraSkipDirs?: string[]
  /** Override the scan root (defaults to whatever is passed to buildProjectIndex). */
  followSymlinks?: boolean
}

function walk(root: string, opts: IndexOptions, out: string[]): void {
  const skip = new Set([...SKIP_DIRS, ...(opts.extraSkipDirs ?? [])])
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = path.join(root, e.name)
    if (e.isSymbolicLink() && !opts.followSymlinks) continue
    if (e.isDirectory()) {
      if (skip.has(e.name)) continue
      walk(full, opts, out)
      continue
    }
    if (!e.isFile()) continue
    if (!isCppFile(full)) continue
    try {
      const st = fs.statSync(full)
      if (st.size > MAX_FILE_BYTES) continue
    } catch {
      continue
    }
    out.push(full)
  }
}

export function buildProjectIndex(root: string, opts: IndexOptions = {}): ProjectIndex {
  const absRoot = path.resolve(root)
  const files: string[] = []
  walk(absRoot, opts, files)

  const byFile = new Map<string, FunctionDef[]>()
  const byName = new Map<string, FunctionDef[]>()
  const callersByCallee = new Map<string, CallSite[]>()
  const calleesByCaller = new Map<string, string[]>()

  for (const filePath of files) {
    let content: string
    try {
      content = fs.readFileSync(filePath, 'utf8')
    } catch {
      continue
    }
    const defs = parseFile(filePath, content)
    if (defs.length === 0) continue
    byFile.set(filePath, defs)
    for (const d of defs) {
      const arr = byName.get(d.name)
      if (arr) arr.push(d)
      else byName.set(d.name, [d])

      const callees = extractCallees(d.body)
      const distinct = Array.from(new Set(callees))
      calleesByCaller.set(d.qualifiedName, distinct)
      for (const c of callees) {
        const cs: CallSite = {
          callerQualifiedName: d.qualifiedName,
          filePath: d.filePath,
          line: d.startLine,
          calleeRaw: c
        }
        const list = callersByCallee.get(c)
        if (list) list.push(cs)
        else callersByCallee.set(c, [cs])
      }
    }
  }

  return { root: absRoot, files, byFile, byName, callersByCallee, calleesByCaller }
}

/**
 * Locate a function definition in the index. If multiple definitions exist
 * for the same simple name (overloads / namespaces), prefer the one whose
 * filePath matches `preferredFile`, then any `.c/.cpp` (definition), then
 * fall back to the first header declaration.
 */
export function findFunction(index: ProjectIndex, name: string, preferredFile?: string): FunctionDef | null {
  const defs = index.byName.get(name)
  if (!defs || defs.length === 0) return null
  if (preferredFile) {
    const exact = defs.find((d) => d.filePath === preferredFile)
    if (exact) return exact
  }
  const inSource = defs.find((d) => !d.isHeader && d.hasBody)
  if (inSource) return inSource
  return defs[0] ?? null
}
