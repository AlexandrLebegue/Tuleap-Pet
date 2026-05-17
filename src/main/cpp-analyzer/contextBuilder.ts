import fs from 'node:fs'
import { findCounterpart } from './pairing'
import type { EnrichedContext, EnrichedContextEntry, FunctionDef, ProjectIndex } from './types'

export type ContextOptions = {
  /** Maximum BFS depth (default 3). */
  depth?: number
  /**
   * Soft token budget for the assembled context, applied across the callees +
   * callers trees combined. Each function body roughly costs `bodyLength/4`
   * tokens. When the budget is exceeded, BFS stops expanding and `truncated`
   * becomes true. Default 12000.
   */
  tokenBudget?: number
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function bfs(
  startName: string,
  edgesFor: (name: string) => string[],
  resolve: (name: string) => FunctionDef | null,
  depth: number,
  budget: { remaining: number; truncated: boolean }
): EnrichedContextEntry[] {
  const visited = new Set<string>([startName])
  const out: EnrichedContextEntry[] = []
  let frontier: string[] = [startName]
  for (let d = 1; d <= depth; d++) {
    const next: string[] = []
    for (const cur of frontier) {
      for (const n of edgesFor(cur)) {
        if (visited.has(n)) continue
        visited.add(n)
        const fn = resolve(n)
        if (!fn) continue
        const cost = estimateTokens(fn.body)
        if (cost > budget.remaining) {
          budget.truncated = true
          continue
        }
        budget.remaining -= cost
        out.push({ fn, depth: d })
        next.push(fn.qualifiedName)
      }
    }
    frontier = next
    if (frontier.length === 0) break
  }
  return out
}

export function buildContext(
  index: ProjectIndex,
  target: FunctionDef,
  opts: ContextOptions = {}
): EnrichedContext {
  const depth = Math.max(1, Math.min(6, opts.depth ?? 3))
  const tokenBudget = Math.max(1000, opts.tokenBudget ?? 12000)
  const budget = { remaining: tokenBudget, truncated: false }

  // Resolve a function by qualifiedName via fallback by simple name.
  const resolveByQualified = (qn: string): FunctionDef | null => {
    const simple = qn.includes('::') ? qn.split('::').pop()! : qn
    const arr = index.byName.get(simple)
    if (!arr || arr.length === 0) return null
    const exact = arr.find((d) => d.qualifiedName === qn)
    if (exact) return exact
    const withBody = arr.find((d) => d.hasBody)
    return withBody ?? arr[0] ?? null
  }
  const resolveBySimple = (name: string): FunctionDef | null => {
    const arr = index.byName.get(name)
    if (!arr || arr.length === 0) return null
    const withBody = arr.find((d) => d.hasBody)
    return withBody ?? arr[0] ?? null
  }

  // Callees: for each function, look up its callees (by simple name) in the index.
  const calleesFor = (qn: string): string[] => {
    const arr = index.calleesByCaller.get(qn)
    if (!arr) return []
    return arr
  }
  const calleesTree = bfs(target.qualifiedName, calleesFor, resolveBySimple, depth, budget)

  // Callers: for each function, look up call sites that target its simple name.
  const callersFor = (qn: string): string[] => {
    const simple = qn.includes('::') ? qn.split('::').pop()! : qn
    const sites = index.callersByCallee.get(simple) ?? []
    return sites.map((s) => s.callerQualifiedName)
  }
  const callersTree = bfs(target.qualifiedName, callersFor, resolveByQualified, depth, budget)

  // Header pairing: only attempt for source files; for headers, skip.
  let header: { filePath: string; content: string } | undefined
  if (!target.isHeader) {
    let sourceContent = ''
    try {
      sourceContent = fs.readFileSync(target.filePath, 'utf8')
    } catch {
      // ignore
    }
    const headerPath = findCounterpart(target.filePath, sourceContent, index.files)
    if (headerPath) {
      try {
        const content = fs.readFileSync(headerPath, 'utf8')
        header = { filePath: headerPath, content }
      } catch {
        // ignore
      }
    }
  }

  const tokenEstimate =
    estimateTokens(target.body) +
    (header ? estimateTokens(header.content) : 0) +
    calleesTree.reduce((s, e) => s + estimateTokens(e.fn.body), 0) +
    callersTree.reduce((s, e) => s + estimateTokens(e.fn.body), 0)

  return {
    target,
    header,
    calleesTree,
    callersTree,
    tokenEstimate,
    truncated: budget.truncated
  }
}

/**
 * Render an `EnrichedContext` as a single string suitable for inclusion in
 * an LLM prompt. Sections are clearly delimited so the model knows what is
 * the target vs. what is supporting context.
 */
export function renderContext(ctx: EnrichedContext): string {
  const parts: string[] = []

  parts.push('=== TARGET FUNCTION ===')
  parts.push(`File: ${ctx.target.filePath}`)
  parts.push(`Qualified name: ${ctx.target.qualifiedName}`)
  parts.push(`Lines: ${ctx.target.startLine}-${ctx.target.endLine}`)
  parts.push('```cpp')
  parts.push(ctx.target.body)
  parts.push('```')
  parts.push('')

  if (ctx.header) {
    parts.push('=== ASSOCIATED HEADER ===')
    parts.push(`File: ${ctx.header.filePath}`)
    parts.push('```cpp')
    parts.push(ctx.header.content.trim())
    parts.push('```')
    parts.push('')
  }

  if (ctx.calleesTree.length > 0) {
    parts.push('=== CALLEES (functions invoked by the target, BFS) ===')
    for (const e of ctx.calleesTree) {
      parts.push(`-- depth=${e.depth}  ${e.fn.qualifiedName}  (${e.fn.filePath}:${e.fn.startLine})`)
      parts.push('```cpp')
      parts.push(e.fn.body)
      parts.push('```')
    }
    parts.push('')
  }

  if (ctx.callersTree.length > 0) {
    parts.push('=== CALLERS (functions that invoke the target, BFS) ===')
    for (const e of ctx.callersTree) {
      parts.push(`-- depth=${e.depth}  ${e.fn.qualifiedName}  (${e.fn.filePath}:${e.fn.startLine})`)
      parts.push('```cpp')
      parts.push(e.fn.body)
      parts.push('```')
    }
    parts.push('')
  }

  if (ctx.truncated) {
    parts.push('(Context truncated — token budget reached during BFS expansion.)')
  }

  return parts.join('\n')
}
