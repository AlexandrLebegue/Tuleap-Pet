import fs from 'node:fs'
import path from 'node:path'
import { isCppFile } from './pairing'

/**
 * Directory basenames skipped when scanning a C/C++ tree for source files.
 * Single source of truth shared by the commenter and test-generator scans
 * (previously each kept its own divergent list).
 */
export const CPP_SKIP_DIRS = new Set([
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  'dist',
  'out',
  'build',
  'cmake-build',
  'cmake-build-debug',
  'cmake-build-release',
  '_deps',
  'CMakeFiles',
  '.cache',
  '.idea',
  '.vscode',
  '.vs'
])

const DEFAULT_LIMIT = 10_000

/** Recursively collect absolute paths of every C/C++ source/header under `root`. */
export function listCppFiles(root: string, limit = DEFAULT_LIMIT): string[] {
  const out: string[] = []
  walk(root)
  return out

  function walk(dir: string): void {
    if (out.length >= limit) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (out.length >= limit) break
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (CPP_SKIP_DIRS.has(e.name)) continue
        walk(full)
      } else if (e.isFile() && isCppFile(full)) {
        out.push(full)
      }
    }
  }
}

/**
 * Locate files matching any of the requested basenames (e.g. `calculator.c`),
 * returning a map of basename → absolute paths. Used to resolve a loose file
 * name back to its location(s) inside a project root.
 */
export function findFilesByBasename(
  root: string,
  targets: Set<string>,
  limit = DEFAULT_LIMIT
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  let found = 0
  walk(root)
  return out

  function walk(dir: string): void {
    if (found >= limit) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (found >= limit) break
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (CPP_SKIP_DIRS.has(e.name)) continue
        walk(full)
      } else if (e.isFile() && targets.has(e.name)) {
        const arr = out.get(e.name)
        if (arr) arr.push(full)
        else out.set(e.name, [full])
        found++
      }
    }
  }
}
