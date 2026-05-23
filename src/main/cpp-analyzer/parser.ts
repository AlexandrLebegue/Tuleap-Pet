import type { FunctionDef } from './types'

const KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default',
  'return', 'break', 'continue', 'goto',
  'sizeof', 'alignof', 'typeid', 'new', 'delete',
  'throw', 'try', 'catch', 'noexcept',
  'typedef', 'using', 'template', 'static_assert',
  'public', 'private', 'protected',
  'true', 'false', 'nullptr',
  'and', 'or', 'not', 'xor',
  'co_await', 'co_yield', 'co_return',
  'class', 'struct', 'union', 'enum', 'namespace',
  'const_cast', 'static_cast', 'dynamic_cast', 'reinterpret_cast'
])

const FN_HEAD_RE = /^([\w\s\*&:<>,\[\]]+?)\s+([A-Za-z_][\w]*(?:::[A-Za-z_][\w]*)*)\s*\(([\s\S]*)\)\s*((?:const|volatile|noexcept(?:\s*\([^)]*\))?|override|final|=\s*0|=\s*default|=\s*delete|->\s*[\w\s\*&:<>,]+|\s)*)$/

const NS_RE = /^(?:inline\s+)?namespace(?:\s+([\w:]+))?\s*$/
const CLS_RE = /^(?:template\s*<[\s\S]*?>\s*)?(?:class|struct|union)\s+([\w]+)(?:\s*final)?(?:\s*:\s*[\w\s,:<>]+)?\s*$/

type FnHead = {
  simpleName: string
  qualified: string
  signature: string
  paramsText: string
}

type Frame =
  | { kind: 'namespace'; name: string; headStartOffset: number }
  | { kind: 'class'; name: string; headStartOffset: number }
  | { kind: 'function'; name: string; headStartOffset: number; fnHead: FnHead }
  | { kind: 'block'; headStartOffset: number }

export function stripCommentsAndStrings(text: string): string {
  const out: string[] = []
  let i = 0
  const len = text.length
  while (i < len) {
    const ch = text[i]
    if (ch === '/' && text[i + 1] === '/') {
      while (i < len && text[i] !== '\n') { out.push(' '); i++ }
      continue
    }
    if (ch === '/' && text[i + 1] === '*') {
      out.push(' '); out.push(' '); i += 2
      while (i + 1 < len && !(text[i] === '*' && text[i + 1] === '/')) {
        out.push(text[i] === '\n' ? '\n' : ' ')
        i++
      }
      if (i + 1 < len) { out.push(' '); out.push(' '); i += 2 }
      continue
    }
    if (ch === '"') {
      out.push('"'); i++
      while (i < len && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < len) { out.push(' '); out.push(' '); i += 2 }
        else { out.push(text[i] === '\n' ? '\n' : ' '); i++ }
      }
      if (i < len) { out.push('"'); i++ }
      continue
    }
    if (ch === "'") {
      out.push("'"); i++
      while (i < len && text[i] !== "'") {
        if (text[i] === '\\' && i + 1 < len) { out.push(' '); out.push(' '); i += 2 }
        else { out.push(' '); i++ }
      }
      if (i < len) { out.push("'"); i++ }
      continue
    }
    out.push(ch as string)
    i++
  }
  return out.join('')
}

function tryParseFunctionHead(buffer: string): FnHead | null {
  const trimmed = buffer.replace(/\s+/g, ' ').trim()
  if (!trimmed.includes('(') || !trimmed.includes(')')) return null

  const m = trimmed.match(FN_HEAD_RE)
  if (!m) return null

  const returnType = (m[1] ?? '').trim()
  const qualified = m[2] ?? ''
  const paramsText = (m[3] ?? '').trim()

  if (!returnType || !qualified) return null
  const simpleName = qualified.includes('::') ? (qualified.split('::').pop() ?? qualified) : qualified
  if (!simpleName || KEYWORDS.has(simpleName)) return null
  if (returnType.split(/\s+/).some((w) => KEYWORDS.has(w))) return null
  // Filter operator overloads and ctor/dtor (no return type — already rejected above for empty returnType).
  if (simpleName.startsWith('operator')) return null

  return { simpleName, qualified, signature: trimmed, paramsText }
}

function offsetToLine(content: string, off: number): number {
  if (off <= 0) return 1
  let n = 1
  for (let i = 0; i < off && i < content.length; i++) {
    if (content[i] === '\n') n++
  }
  return n
}

export function isHeaderPath(filePath: string): boolean {
  return /\.(h|hpp|hxx|hh)$/i.test(filePath)
}

export function parseFile(filePath: string, content: string): FunctionDef[] {
  const isHeader = isHeaderPath(filePath)
  const cleaned = stripCommentsAndStrings(content)
  const len = cleaned.length

  const stack: Frame[] = []
  const out: FunctionDef[] = []

  let buffer = ''
  let bufferStart = 0
  let i = 0
  let atLineStart = true

  while (i < len) {
    const ch = cleaned[i]

    // Preprocessor: skip the whole line (with backslash continuations).
    if (atLineStart && ch === '#') {
      while (i < len) {
        if (cleaned[i] === '\\' && cleaned[i + 1] === '\n') { i += 2; continue }
        if (cleaned[i] === '\n') break
        i++
      }
      buffer = ''
      bufferStart = i
      continue
    }

    if (ch === '\n') { atLineStart = true; i++; continue }
    if (ch !== ' ' && ch !== '\t') atLineStart = false

    if (ch === '{') {
      const head = buffer.replace(/\s+/g, ' ').trim()
      let frame: Frame

      const nsMatch = head.match(NS_RE)
      const clsMatch = !head.includes('(') ? head.match(CLS_RE) : null
      const fn = !nsMatch && !clsMatch ? tryParseFunctionHead(head) : null

      if (nsMatch) {
        frame = { kind: 'namespace', name: nsMatch[1] ?? '', headStartOffset: bufferStart }
      } else if (clsMatch) {
        frame = { kind: 'class', name: clsMatch[1] ?? '', headStartOffset: bufferStart }
      } else if (fn) {
        frame = { kind: 'function', name: fn.simpleName, headStartOffset: bufferStart, fnHead: fn }
      } else {
        frame = { kind: 'block', headStartOffset: bufferStart }
      }
      stack.push(frame)
      buffer = ''
      bufferStart = i + 1
      i++
      continue
    }

    if (ch === '}') {
      const closed = stack.pop()
      if (closed && closed.kind === 'function') {
        const nsParts: string[] = []
        const clsParts: string[] = []
        for (const s of stack) {
          if (s.kind === 'namespace' && s.name) nsParts.push(s.name)
          else if (s.kind === 'class') clsParts.push(s.name)
        }

        const qualifiedParts = closed.fnHead.qualified.split('::')
        let simpleName = closed.fnHead.simpleName
        let inlineClass = ''
        if (qualifiedParts.length > 1) {
          inlineClass = qualifiedParts.slice(0, -1).join('::')
          simpleName = qualifiedParts[qualifiedParts.length - 1] ?? simpleName
        }

        const className = [...clsParts, ...(inlineClass ? [inlineClass] : [])]
          .filter(Boolean)
          .join('::')
        const fullyQualified = [nsParts.join('::'), className, simpleName]
          .filter(Boolean)
          .join('::')

        let trueStart = closed.headStartOffset
        while (
          trueStart < len &&
          (cleaned[trueStart] === ' ' || cleaned[trueStart] === '\t' ||
           cleaned[trueStart] === '\n' || cleaned[trueStart] === '\r')
        ) {
          trueStart++
        }
        const startLine = offsetToLine(content, trueStart)
        const endLine = offsetToLine(content, i)
        const body = content.slice(closed.headStartOffset, i + 1).replace(/^\s+/, '')

        out.push({
          name: simpleName,
          qualifiedName: fullyQualified,
          signature: closed.fnHead.signature,
          filePath,
          startLine,
          endLine,
          body,
          namespacePath: nsParts.join('::'),
          className,
          isHeader,
          hasBody: true
        })
      }
      buffer = ''
      bufferStart = i + 1
      i++
      continue
    }

    if (ch === ';') {
      buffer = ''
      bufferStart = i + 1
      i++
      continue
    }

    buffer += ch
    i++
  }

  return out
}

export function extractIncludes(content: string): string[] {
  const out: string[] = []
  const re = /^\s*#\s*include\s+[<"]([^>"]+)[>"]/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    if (m[1]) out.push(m[1])
  }
  return out
}
