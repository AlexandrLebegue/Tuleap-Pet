import { describe, expect, it } from 'vitest'
import { parseEvaluation, buildEvalPrompt } from '../../src/main/commenter/comment-evaluator'
import type { FunctionDef, EnrichedContext } from '../../src/main/cpp-analyzer/types'

const FN: FunctionDef = {
  name: 'add', qualifiedName: 'calc::add',
  signature: 'int add(int a, int b)',
  filePath: '/x/calc.cpp', startLine: 1, endLine: 3,
  body: 'int add(int a, int b) { return a + b; }',
  namespacePath: 'calc', className: '', isHeader: false, hasBody: true
}
const EMPTY_CTX: EnrichedContext = {
  target: FN, header: undefined, calleesTree: [], callersTree: [],
  tokenEstimate: 0, truncated: false
}

describe('parseEvaluation', () => {
  it('parses a YES verdict with reason', () => {
    const ev = parseEvaluation('YES | The brief and param docs are complete and accurate.')
    expect(ev.sufficient).toBe(true)
    expect(ev.reason).toMatch(/brief/)
  })

  it('parses a NO verdict with reason', () => {
    const ev = parseEvaluation('NO | No comment present at all.')
    expect(ev.sufficient).toBe(false)
    expect(ev.reason).toMatch(/No comment/)
  })

  it('tolerates surrounding whitespace and markdown', () => {
    const ev = parseEvaluation('  **YES** | already documented  ')
    expect(ev.sufficient).toBe(true)
    expect(ev.reason).toBe('already documented')
  })

  it('defaults to NO with a defensive reason on unparseable output', () => {
    const ev = parseEvaluation('I think it could be improved.')
    expect(ev.sufficient).toBe(false)
    expect(ev.reason).toMatch(/unparseable/i)
  })
})

describe('buildEvalPrompt', () => {
  it('embeds the function body and the existing comment in the user prompt', () => {
    const { user } = buildEvalPrompt({
      fn: FN,
      existingComment: '/* legacy doc */',
      context: EMPTY_CTX
    })
    expect(user).toContain('int add(int a, int b)')
    expect(user).toContain('legacy doc')
    expect(user).toContain('YES|NO')
  })

  it('prints "no comment block" when none is provided', () => {
    const { user } = buildEvalPrompt({
      fn: FN,
      existingComment: null,
      context: EMPTY_CTX
    })
    expect(user).toContain('no comment block')
  })
})
