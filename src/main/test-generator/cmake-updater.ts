import fs from 'node:fs'
import { extractCMakeBlocks } from './cmake-discovery'
import type { CMakeInsertionMode } from './cmake-discovery'

export type UpdateResult =
  | { ok: true; cmakeFile: string; inserted: string[]; before: string; after: string }
  | { ok: false; reason: string; cmakeFile: string }

export type UpdateOptions = {
  /** When true, do not write the file; only return the would-be `after` text. */
  dryRun?: boolean
}

/**
 * Insert one or more new source files into a CMakeLists.txt according to the
 * detected insertion mode.
 *
 * - `add_executable` / `target_sources`: append the new sources inside the
 *   matching block, preserving the surrounding indentation. Idempotent: if a
 *   source is already present, it is skipped.
 * - `append`: append a fresh `target_sources(<target> PRIVATE …)` call at
 *   the end of the file (target inferred from `mode.target`; if null, no
 *   change is made and an error is returned).
 */
export function updateCMakeLists(
  cmakeFile: string,
  mode: CMakeInsertionMode,
  newSources: string[],
  opts: UpdateOptions = {}
): UpdateResult {
  let before: string
  try {
    before = fs.readFileSync(cmakeFile, 'utf8')
  } catch (err) {
    return { ok: false, reason: `unable to read CMake file: ${(err as Error).message}`, cmakeFile }
  }

  const inserted: string[] = []
  let after = before

  if (mode.kind === 'add_executable' || mode.kind === 'target_sources') {
    const target = mode.target
    const blocks = extractCMakeBlocks(before).filter(
      (b) => b.command === mode.kind && b.body.trim().startsWith(target)
    )
    if (blocks.length === 0) {
      return { ok: false, reason: `no ${mode.kind}(${target} …) block found`, cmakeFile }
    }
    const block = blocks[0]!
    const body = block.body
    const indent = detectListIndent(body)
    const filtered = newSources.filter((s) => !body.includes(s))
    if (filtered.length === 0) {
      return { ok: true, cmakeFile, inserted: [], before, after: before }
    }
    const newBody = appendSourcesToBlock(body, filtered, indent)
    after = before.slice(0, block.start) +
      before.slice(block.start, block.end).replace(body, newBody) +
      before.slice(block.end)
    inserted.push(...filtered)
  } else if (mode.kind === 'append') {
    return {
      ok: false,
      reason: 'no target_sources/add_executable block was associated with the template file (manual edit required)',
      cmakeFile
    }
  }

  if (!opts.dryRun && after !== before) {
    try {
      fs.writeFileSync(cmakeFile, after, 'utf8')
    } catch (err) {
      return { ok: false, reason: `unable to write CMake file: ${(err as Error).message}`, cmakeFile }
    }
  }

  return { ok: true, cmakeFile, inserted, before, after }
}

function detectListIndent(body: string): string {
  const lines = body.split('\n')
  for (const l of lines) {
    const m = l.match(/^([ \t]+)\S/)
    if (m) return m[1]!
  }
  return '  '
}

function appendSourcesToBlock(body: string, newSources: string[], indent: string): string {
  // Split off any trailing whitespace before the (implicit) closing ')'.
  const trailingWsMatch = body.match(/\s*$/)
  const trailingWs = trailingWsMatch ? trailingWsMatch[0] : ''
  const trimmedBody = body.slice(0, body.length - trailingWs.length)

  // Preserve the existing trailing newline / indentation style. We want each
  // appended source on its own indented line ending with a newline so the
  // closing ')' lands on its own line.
  const lines = newSources.map((s) => `${indent}${s}`)
  const sep = trimmedBody.endsWith('\n') ? '' : '\n'
  return trimmedBody + sep + lines.join('\n') + '\n'
}
