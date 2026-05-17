import path from 'node:path'
import { extractIncludes } from './parser'

const SOURCE_EXTS = ['.c', '.cc', '.cpp', '.cxx']
const HEADER_EXTS = ['.h', '.hh', '.hpp', '.hxx']

export function isSourceFile(p: string): boolean {
  return SOURCE_EXTS.some((e) => p.toLowerCase().endsWith(e))
}

export function isHeaderFile(p: string): boolean {
  return HEADER_EXTS.some((e) => p.toLowerCase().endsWith(e))
}

export function isCppFile(p: string): boolean {
  return isSourceFile(p) || isHeaderFile(p)
}

function basenameNoExt(p: string): string {
  const b = path.basename(p)
  const i = b.lastIndexOf('.')
  return i < 0 ? b : b.slice(0, i)
}

/**
 * Find the header (`.h/.hpp/...`) that pairs with a source file (or vice
 * versa). Two strategies, in order:
 * 1) Same basename (e.g. `calculator.cpp` ↔ `calculator.h`)
 * 2) The source file's `#include "xxx.h"` directive matching a file in the
 *    project index.
 *
 * `allFiles` must be the project index's flat list of absolute paths.
 * Returns the absolute path of the paired file, or `null`.
 */
export function findCounterpart(filePath: string, content: string, allFiles: string[]): string | null {
  const base = basenameNoExt(filePath)
  const wantHeader = isSourceFile(filePath)
  const candidates = wantHeader ? HEADER_EXTS : SOURCE_EXTS

  // Strategy 1: exact basename match
  for (const ext of candidates) {
    const match = allFiles.find((f) => basenameNoExt(f) === base && f.toLowerCase().endsWith(ext))
    if (match && match !== filePath) return match
  }

  // Strategy 2: scan includes (only meaningful for source -> header)
  if (wantHeader) {
    const includes = extractIncludes(content)
    for (const inc of includes) {
      const incBase = basenameNoExt(inc)
      const incExt = path.extname(inc).toLowerCase()
      if (!HEADER_EXTS.includes(incExt)) continue
      const match = allFiles.find((f) => basenameNoExt(f) === incBase && f.toLowerCase().endsWith(incExt))
      if (match) return match
    }
  }

  return null
}
