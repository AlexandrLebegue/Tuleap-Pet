export type ParsedFunction = {
  name: string
  signature: string
  lineNumber: number
  sourceCode: string
  parameters: { name: string; type: string }[]
  returnType: string
  description: string
}

export type FileInfo = {
  name: string
  headerFile?: string
  dependencies: string[]
  classes?: string[]
  globalVariables?: string[]
}

export type ParseResult = {
  fileInfo: FileInfo
  functions: ParsedFunction[]
}

const NON_FUNC_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'switch', 'return', 'sizeof',
  'typedef', 'struct', 'enum', 'union', 'case', 'do', 'goto'
])

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

export function extractFunctionsFromFile(content: string, filename: string): ParseResult {
  if (filename.endsWith('.py')) {
    return parsePythonFile(content, filename)
  }
  if (filename.match(/\.(c|h|cpp|hpp|cxx|hxx|cc)$/i)) {
    return parseCFile(content, filename)
  }
  throw new Error(`Extension non supportée: ${filename}`)
}

// ────────────────────────────────────────────────────────────
// C Parser
// ────────────────────────────────────────────────────────────

function parseCFile(content: string, filename: string): ParseResult {
  const lines = content.split('\n')
  const includes: string[] = []

  for (const line of lines) {
    const m = line.match(/#include\s+[<"](.+?)[>"]/)
    if (m?.[1]) includes.push(m[1])
  }

  const headerFile = filename.endsWith('.c') ? filename.replace(/\.c$/, '.h') : filename

  const fileInfo: FileInfo = {
    name: filename,
    headerFile,
    dependencies: includes,
    globalVariables: []
  }

  const functions = extractCFunctions(content, lines)

  return { fileInfo, functions }
}

function stripCComments(text: string): string {
  const result: string[] = []
  let i = 0
  while (i < text.length) {
    if (text[i] === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') { result.push(' '); i++ }
    } else if (text[i] === '/' && text[i + 1] === '*') {
      result.push(' '); result.push(' '); i += 2
      while (i + 1 < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        result.push(text[i] === '\n' ? '\n' : ' ')
        i++
      }
      if (i + 1 < text.length) { result.push(' '); result.push(' '); i += 2 }
    } else {
      result.push(text[i]!); i++
    }
  }
  return result.join('')
}

function extractFunctionBody(text: string, braceStart: number): number {
  let depth = 0
  let i = braceStart
  while (i < text.length) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i + 1
    }
    i++
  }
  return text.length
}

function parseParams(raw: string): { name: string; type: string }[] {
  raw = raw.trim()
  if (!raw || raw === 'void') return []
  return raw.split(',').flatMap((p) => {
    p = p.trim()
    if (!p) return []
    const arr = p.match(/^(.+?)\s+(\w+)\s*\[.*\]$/)
    if (arr?.[1] && arr?.[2]) return [{ name: arr[2], type: arr[1].trim() + '[]' }]
    const ptr = p.match(/^(.+\*)\s*(\w+)$/)
    if (ptr?.[1] && ptr?.[2]) return [{ name: ptr[2], type: ptr[1].trim() }]
    const parts = p.split(/\s+/)
    const lastName = parts[parts.length - 1]
    if (parts.length >= 2 && lastName) return [{ name: lastName, type: parts.slice(0, -1).join(' ') }]
    return [{ name: p, type: 'unknown' }]
  })
}

function extractCFunctions(content: string, lines: string[]): ParsedFunction[] {
  const cleaned = stripCComments(content)
  const cleanedLines = cleaned.split('\n')
  const functions: ParsedFunction[] = []

  let i = 0
  while (i < cleanedLines.length) {
    const line = cleanedLines[i]
    if (!line) { i++; continue }
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('typedef') || trimmed.startsWith('//')) {
      i++; continue
    }

    let combined = trimmed
    let endLine = i
    const maxLook = 10
    while (!combined.includes('{') && endLine < Math.min(i + maxLook, cleanedLines.length - 1)) {
      endLine++
      combined += ' ' + (cleanedLines[endLine]?.trim() ?? '')
    }
    if (!combined.includes('{')) { i++; continue }

    const FUNC_RE = /^((?:(?:static|inline|extern|const|unsigned|signed|long|short|volatile|register)\s+)*\w[\w\s]*?(?:\s*\*+\s*)?)\s*(\w+)\s*\(\s*(.*?)\s*\)\s*\{/s
    const match = combined.match(FUNC_RE)
    if (!match?.[1] || !match[2]) { i++; continue }

    const returnType = match[1].trim()
    const funcName = match[2].trim()
    const paramsStr = (match[3] ?? '').trim()

    if (NON_FUNC_KEYWORDS.has(funcName)) { i++; continue }
    if ([...returnType.split(/\s+/)].some((w) => NON_FUNC_KEYWORDS.has(w))) { i++; continue }
    if (returnType.includes('static')) { i++; continue }

    const charOffset = cleanedLines.slice(0, i).reduce((acc, l) => acc + l.length + 1, 0)
    const braceIdx = cleaned.indexOf('{', charOffset)
    if (braceIdx < 0) { i++; continue }

    const bodyEnd = extractFunctionBody(cleaned, braceIdx)
    const endLineNum = cleaned.slice(0, bodyEnd).split('\n').length

    const sourceLines = lines.slice(i, endLineNum)
    const sourceCode = sourceLines.join('\n').trimEnd()

    functions.push({
      name: funcName,
      signature: `${returnType} ${funcName}(${paramsStr})`,
      lineNumber: i + 1,
      sourceCode,
      parameters: parseParams(paramsStr),
      returnType,
      description: `Function ${funcName} at line ${i + 1}`
    })

    i = endLineNum
  }

  return functions
}

// ────────────────────────────────────────────────────────────
// Python Parser (regex-based, no ast module in Node.js)
// ────────────────────────────────────────────────────────────

function parsePythonFile(content: string, filename: string): ParseResult {
  const lines = content.split('\n')
  const dependencies: string[] = []
  const classes: string[] = []

  for (const line of lines) {
    const imp = line.match(/^import\s+(\S+)/)
    if (imp?.[1]) dependencies.push(imp[1])
    const fromImp = line.match(/^from\s+(\S+)\s+import/)
    if (fromImp?.[1]) dependencies.push(fromImp[1])
    const cls = line.match(/^class\s+(\w+)/)
    if (cls?.[1]) classes.push(cls[1])
  }

  const fileInfo: FileInfo = {
    name: filename,
    dependencies: [...new Set(dependencies)],
    classes
  }

  const functions = extractPythonFunctions(lines)
  return { fileInfo, functions }
}

function extractPythonFunctions(lines: string[]): ParsedFunction[] {
  const functions: ParsedFunction[] = []
  const FUNC_RE = /^(async\s+)?def\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?\s*:/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const match = line.match(FUNC_RE)
    if (!match?.[2]) continue

    const isAsync = !!match[1]
    const name = match[2]
    if (name.startsWith('_')) continue

    const paramsRaw = (match[3] ?? '').trim()
    const returnTypeRaw = match[4]?.trim() ?? 'Any'

    const baseIndent = line.length - line.trimStart().length
    let endLine = i + 1
    while (endLine < lines.length) {
      const l = lines[endLine]
      if (!l) { endLine++; continue }
      if (l.trim() === '') { endLine++; continue }
      const indent = l.length - l.trimStart().length
      if (indent <= baseIndent) break
      endLine++
    }

    const sourceCode = lines.slice(i, endLine).join('\n').trimEnd()

    let description = `Function ${name} at line ${i + 1}`
    const nextLine = lines[i + 1]?.trim()
    if (nextLine) {
      const docMatch = nextLine.match(/^"""(.+?)"""$/) ?? nextLine.match(/^'''(.+?)'''$/)
      if (docMatch?.[1]) description = docMatch[1].trim()
      else if (nextLine.startsWith('"""') || nextLine.startsWith("'''")) {
        description = nextLine.replace(/^["']{3}/, '').trim()
      }
    }

    const parameters = paramsRaw
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p && p !== 'self' && p !== '*' && !p.startsWith('**'))
      .map((p) => {
        const typed = p.match(/^(\w+)\s*:\s*(.+?)(?:\s*=.*)?$/)
        if (typed?.[1] && typed[2]) return { name: typed[1], type: typed[2].trim() }
        const named = p.match(/^(\w+)(?:\s*=.*)?$/)
        if (named?.[1]) return { name: named[1], type: 'Any' }
        return { name: p.split('=')[0]?.trim() ?? p, type: 'Any' }
      })

    const prefix = isAsync ? 'async def' : 'def'
    functions.push({
      name,
      signature: `${prefix} ${name}(${paramsRaw})${returnTypeRaw !== 'Any' ? ` -> ${returnTypeRaw}` : ''}`,
      lineNumber: i + 1,
      sourceCode,
      parameters,
      returnType: returnTypeRaw,
      description
    })
  }

  return functions
}
