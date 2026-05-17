import { stripCommentsAndStrings } from './parser'

const CALL_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case',
  'return', 'sizeof', 'alignof', 'typeid', 'new', 'delete',
  'throw', 'catch', 'noexcept',
  'typedef', 'using', 'template', 'static_assert',
  'true', 'false', 'nullptr',
  'and', 'or', 'not', 'xor',
  'co_await', 'co_yield', 'co_return',
  'const_cast', 'static_cast', 'dynamic_cast', 'reinterpret_cast',
  'decltype', 'auto', 'void', 'int', 'long', 'short', 'char',
  'float', 'double', 'bool', 'unsigned', 'signed',
  'class', 'struct', 'union', 'enum',
  'public', 'private', 'protected',
  'constexpr', 'consteval', 'constinit', 'inline', 'static', 'extern',
  'mutable', 'thread_local', 'volatile', 'register',
  'explicit', 'virtual', 'override', 'final',
  'goto', 'continue', 'break'
])

/**
 * Replace every char before the first `{` with a space (newlines kept). This
 * removes the function signature from consideration when scanning for call
 * sites, while preserving line numbering for downstream reporting.
 */
function maskSignature(cleaned: string): string {
  const idx = cleaned.indexOf('{')
  if (idx < 0) return cleaned
  const prefix = cleaned.slice(0, idx).replace(/[^\n]/g, ' ')
  return prefix + cleaned.slice(idx)
}

/**
 * Extracts callee identifiers from a function body. Returns the *simple* name
 * (last `::` segment) so it can be matched against the project's by-name index.
 * The same callee invoked N times is returned N times — callers dedup as
 * needed.
 */
export function extractCallees(body: string): string[] {
  const cleaned = maskSignature(stripCommentsAndStrings(body))
  const out: string[] = []
  const re = /([\w:>.\-])?\b([A-Za-z_][\w]*(?:::[A-Za-z_][\w]*)*)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned)) !== null) {
    const qualified = m[2] ?? ''
    if (!qualified) continue
    const simple = qualified.includes('::') ? (qualified.split('::').pop() ?? qualified) : qualified
    if (!simple || CALL_KEYWORDS.has(simple)) continue
    out.push(simple)
  }
  return out
}

/**
 * Same as `extractCallees` but also reports the 1-based line of each call
 * site relative to the start of `body` (the function signature line counts
 * as line 1).
 */
export function extractCallSites(body: string): Array<{ name: string; line: number }> {
  const cleaned = maskSignature(stripCommentsAndStrings(body))
  const out: Array<{ name: string; line: number }> = []
  const re = /([\w:>.\-])?\b([A-Za-z_][\w]*(?:::[A-Za-z_][\w]*)*)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned)) !== null) {
    const qualified = m[2] ?? ''
    if (!qualified) continue
    const simple = qualified.includes('::') ? (qualified.split('::').pop() ?? qualified) : qualified
    if (!simple || CALL_KEYWORDS.has(simple)) continue
    const offset = m.index + (m[1] ? m[1].length : 0)
    const line = (cleaned.slice(0, offset).match(/\n/g)?.length ?? 0) + 1
    out.push({ name: simple, line })
  }
  return out
}
