export type CommentRange = {
  /** 1-based, inclusive. */
  startLine: number
  /** 1-based, inclusive (last line of the comment block). */
  endLine: number
  /** Raw text of the comment block as it appears in the file. */
  text: string
}

/**
 * Locate the doc-comment block (if any) immediately preceding `fnStartLine` in
 * `content`. Recognises:
 *  - block comments `/* ... *\/` (incl. Doxygen `/*!`, `/**`)
 *  - clusters of `//` (or `///`) line comments
 *  - optional leading delimiter line `/*----------…----------*\/` used by the
 *    project's Doxygen banner style
 *
 * Returns `null` if there is no comment block touching the function.
 */
export function findExistingCommentRange(content: string, fnStartLine: number): CommentRange | null {
  const lines = content.split('\n')
  // 0-indexed line just before the signature
  let i = fnStartLine - 2
  while (i >= 0 && lines[i] !== undefined && lines[i]!.trim() === '') i--
  if (i < 0) return null

  const last = lines[i]!.trimEnd()

  // Block comment ending with */
  if (last.endsWith('*/')) {
    let start = i
    while (start >= 0) {
      const l = lines[start]!
      if (/^\s*\/\*/.test(l)) break
      start--
    }
    if (start < 0) return null
    // Optional leading banner delimiter
    if (start > 0) {
      const above = lines[start - 1]!.trim()
      if (/^\/\*-+\*\/$/.test(above) || /^\/\*=+\*\/$/.test(above)) start--
    }
    const text = lines.slice(start, i + 1).join('\n')
    return { startLine: start + 1, endLine: i + 1, text }
  }

  // Line comments cluster
  if (/^\s*\/\//.test(last)) {
    let start = i
    while (start > 0 && /^\s*\/\//.test(lines[start - 1] ?? '')) start--
    const text = lines.slice(start, i + 1).join('\n')
    return { startLine: start + 1, endLine: i + 1, text }
  }

  return null
}

export function detectFunctionIndent(content: string, fnStartLine: number): string {
  const lines = content.split('\n')
  const line = lines[fnStartLine - 1] ?? ''
  const m = line.match(/^([ \t]+)/)
  return m?.[1] ?? ''
}
