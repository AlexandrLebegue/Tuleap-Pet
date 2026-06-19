import fs from 'node:fs'
import path from 'node:path'
import { buildProjectIndex } from '../cpp-analyzer/projectIndex'
import { findCounterpart, isHeaderFile } from '../cpp-analyzer/pairing'
import type { FunctionDef } from '../cpp-analyzer/types'
import type { HeaderEntry, HeaderFunctionEntry } from '@shared/types'

/**
 * Build a header-driven view of a cloned C/C++ project: for each header file,
 * the functions reachable from it — defined inline in the header itself, or in
 * its paired source file (same basename / matching include). Each entry records
 * where the function is actually implemented.
 *
 * The cpp-analyzer parser only extracts function *definitions* (with a body);
 * pure declarations (`int add(int);`) are not emitted. We therefore surface the
 * implementations rather than the declarations, which is also what the test
 * generator needs as input.
 *
 * Returned paths are relative to `cloneDir`.
 */
export function buildHeaderIndex(cloneDir: string): HeaderEntry[] {
  const index = buildProjectIndex(cloneDir)
  const rel = (abs: string): string => path.relative(cloneDir, abs).replace(/\\/g, '/')

  const defToEntry = (def: FunctionDef, inHeader: boolean): HeaderFunctionEntry => ({
    name: def.name,
    signature: def.signature,
    implFile: rel(def.filePath),
    implLine: def.startLine,
    inHeader
  })

  const headers = index.files.filter((f) => isHeaderFile(f))
  const entries: HeaderEntry[] = []

  for (const header of headers) {
    let headerContent = ''
    try {
      headerContent = fs.readFileSync(header, 'utf8')
    } catch {
      headerContent = ''
    }

    const seen = new Set<string>()
    const functions: HeaderFunctionEntry[] = []

    // 1. Functions defined inline inside the header (with a body).
    for (const def of index.byFile.get(header) ?? []) {
      if (seen.has(def.name)) continue
      seen.add(def.name)
      functions.push(defToEntry(def, true))
    }

    // 2. Functions implemented in the paired source file (foo.h -> foo.c).
    const counterpart = findCounterpart(header, headerContent, index.files)
    if (counterpart) {
      for (const def of index.byFile.get(counterpart) ?? []) {
        if (seen.has(def.name)) continue
        seen.add(def.name)
        functions.push(defToEntry(def, false))
      }
    }

    if (functions.length === 0) continue

    functions.sort((a, b) => a.name.localeCompare(b.name))
    entries.push({ headerPath: rel(header), functions })
  }

  entries.sort((a, b) => a.headerPath.localeCompare(b.headerPath))
  return entries
}
