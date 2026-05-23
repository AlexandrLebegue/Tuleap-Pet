/**
 * Adapts FunctionDef (from cpp-analyzer) to the ParsedFunction shape expected
 * by the renderer UI and the simple test-generation prompts.
 */

import type { FunctionDef } from '../cpp-analyzer/types'
import type { ParsedFunction, FileInfo } from '../parser/code-parser'

/**
 * Extract the return type from a function signature string.
 * For a signature like `int add(int a, int b)`, returns `int`.
 */
export function extractReturnType(signature: string): string {
  // The signature from cpp-analyzer looks like: "int add(int a, int b)"
  // or "const std::vector<int>& func(...)".
  // We find the opening paren to isolate the return+name prefix, then strip the function name.
  const parenIdx = signature.indexOf('(')
  if (parenIdx < 0) return 'void'
  const prefix = signature.slice(0, parenIdx).trim()
  // The last word-like token (possibly containing ::) is the function name.
  const tokens = prefix.split(/\s+/)
  if (tokens.length <= 1) return 'void'
  // Function name is the last token
  tokens.pop()
  return tokens.join(' ').trim() || 'void'
}

/**
 * Extract parameter list from a function signature string.
 * For `int add(int a, int b)`, returns `[{name:'a',type:'int'}, {name:'b',type:'int'}]`.
 */
export function extractParams(signature: string): { name: string; type: string }[] {
  const openParen = signature.indexOf('(')
  const closeParen = signature.lastIndexOf(')')
  if (openParen < 0 || closeParen < 0) return []
  const inner = signature.slice(openParen + 1, closeParen).trim()
  if (!inner || inner === 'void') return []

  return inner.split(',').flatMap((part) => {
    const p = part.trim()
    if (!p) return []

    // Handle cases like `const std::vector<int>& v` or `int *ptr`
    // Strategy: the last identifier token is the parameter name, everything before is the type.
    // Careful with `const char *name` → type="const char *", name="name"
    const stripped = p.replace(/\s*=\s*.*$/, '') // remove default values
    const tokens = stripped.split(/\s+/)
    if (tokens.length === 0) return []

    // Last token might be `*name` or `&name`
    let lastName = tokens[tokens.length - 1] ?? ''
    if (lastName.startsWith('*') || lastName.startsWith('&')) {
      // Pointer/ref prefix attached to name
      const name = lastName.replace(/^[*&]+/, '')
      const typeParts = tokens.slice(0, -1).join(' ') + lastName.replace(name, '')
      return name ? [{ name, type: typeParts.trim() }] : []
    }

    if (tokens.length === 1) return [{ name: lastName, type: 'auto' }]
    return [{ name: lastName, type: tokens.slice(0, -1).join(' ') }]
  })
}

/**
 * Convert a single `FunctionDef` from cpp-analyzer to a `ParsedFunction`
 * compatible with the renderer UI and the simple generation path.
 */
export function functionDefToParsed(def: FunctionDef): ParsedFunction {
  return {
    name: def.name,
    signature: def.signature,
    returnType: extractReturnType(def.signature),
    lineNumber: def.startLine,
    sourceCode: def.body,
    parameters: extractParams(def.signature),
    description: def.qualifiedName !== def.name
      ? `${def.qualifiedName} (${def.filePath}:${def.startLine})`
      : `${def.name} (${def.filePath}:${def.startLine})`
  }
}

/**
 * Build a FileInfo object from parsing results and the filename.
 */
export function buildFileInfoFromDefs(
  defs: FunctionDef[],
  filename: string
): FileInfo {
  const isC = /\.c$/i.test(filename)
  const headerFile = isC ? filename.replace(/\.c$/i, '.h') : filename

  // Collect unique namespaces as pseudo-classes for context
  const namespaces = [...new Set(defs.map((d) => d.namespacePath).filter(Boolean))]

  return {
    name: filename,
    headerFile,
    dependencies: [], // Will be filled from the actual file includes if needed
    classes: namespaces.length > 0 ? namespaces : undefined,
    globalVariables: []
  }
}
