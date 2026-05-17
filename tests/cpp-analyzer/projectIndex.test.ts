import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildProjectIndex, findFunction } from '../../src/main/cpp-analyzer/projectIndex'
import { buildContext } from '../../src/main/cpp-analyzer/contextBuilder'
import { findCounterpart } from '../../src/main/cpp-analyzer/pairing'

const SAMPLE = path.resolve(__dirname, '../../samples/cpp-demo')

describe('buildProjectIndex against samples/cpp-demo', () => {
  const index = buildProjectIndex(SAMPLE)

  it('walks all .cpp/.h files in src and tests, ignoring build/', () => {
    const rel = index.files.map((f) => path.relative(SAMPLE, f)).sort()
    expect(rel).toContain('src/calculator.cpp')
    expect(rel).toContain('src/calculator.h')
    expect(rel).toContain('src/strutil.cpp')
    expect(rel).toContain('src/strutil.h')
    expect(rel).toContain('tests/test_calculator.cpp')
    expect(rel.every((p) => !p.startsWith('build/'))).toBe(true)
  })

  it('extracts every calc:: function from calculator.cpp', () => {
    const expected = ['calc::add', 'calc::multiply', 'calc::square', 'calc::sum', 'calc::average', 'calc::max_element']
    for (const qn of expected) {
      const arr = Array.from(index.byFile.values())
        .flat()
        .filter((d) => d.qualifiedName === qn)
      expect(arr.length, `missing ${qn}`).toBeGreaterThanOrEqual(1)
    }
  })

  it('builds the call graph: square calls multiply, sum calls add, average calls sum', () => {
    // The extractor surfaces every identifier followed by '(' (incl. std member
    // methods like `v.empty()` and `v.size()`). Resolution to actual project
    // functions happens in buildContext — here we only require the *expected*
    // edges to be present.
    expect(index.calleesByCaller.get('calc::square')).toContain('multiply')
    expect(index.calleesByCaller.get('calc::sum')).toContain('add')
    expect(index.calleesByCaller.get('calc::average')).toContain('sum')
  })

  it('reverse lookup: add has at least sum as a caller', () => {
    const sites = index.callersByCallee.get('add') ?? []
    const callers = sites.map((s) => s.callerQualifiedName)
    expect(callers).toContain('calc::sum')
  })

  it('findCounterpart pairs calculator.cpp with calculator.h', () => {
    const fs = require('node:fs') as typeof import('node:fs')
    const cpp = path.join(SAMPLE, 'src/calculator.cpp')
    const content = fs.readFileSync(cpp, 'utf8')
    const counterpart = findCounterpart(cpp, content, index.files)
    expect(counterpart).toBe(path.join(SAMPLE, 'src/calculator.h'))
  })
})

describe('buildContext on samples/cpp-demo', () => {
  const index = buildProjectIndex(SAMPLE)

  it('for calc::average: includes sum (depth 1) and add (depth 2) as callees', () => {
    const target = findFunction(index, 'average', path.join(SAMPLE, 'src/calculator.cpp'))!
    const ctx = buildContext(index, target, { depth: 3 })
    const calleeQns = ctx.calleesTree.map((e) => `${e.depth}:${e.fn.qualifiedName}`)
    expect(calleeQns).toContain('1:calc::sum')
    expect(calleeQns).toContain('2:calc::add')
  })

  it('for calc::add: surfaces calc::sum and calc::average as callers', () => {
    const target = findFunction(index, 'add', path.join(SAMPLE, 'src/calculator.cpp'))!
    const ctx = buildContext(index, target, { depth: 3 })
    const callerQns = ctx.callersTree.map((e) => `${e.depth}:${e.fn.qualifiedName}`)
    expect(callerQns).toContain('1:calc::sum')
    expect(callerQns).toContain('2:calc::average')
  })

  it('attaches the paired header for a source-file target', () => {
    const target = findFunction(index, 'square', path.join(SAMPLE, 'src/calculator.cpp'))!
    const ctx = buildContext(index, target)
    expect(ctx.header?.filePath).toBe(path.join(SAMPLE, 'src/calculator.h'))
    expect(ctx.header?.content).toContain('int square(int x)')
  })
})
