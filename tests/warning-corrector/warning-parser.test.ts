import { describe, it, expect } from 'vitest'
import {
  parseWarnings,
  groupByFile,
  diffWarnings,
  warningKey
} from '../../src/main/warning-corrector/warning-parser'

describe('parseWarnings', () => {
  it('parses GCC/Clang warnings with category and column', () => {
    const log = [
      'src/calculator.cpp:20:7: warning: unused variable ‘total’ [-Wunused-variable]',
      'src/strutil.cpp:8: warning: comparison of integer expressions [-Wsign-compare]',
      'note: this is not a warning and must be ignored'
    ].join('\n')
    const ws = parseWarnings(log)
    expect(ws).toHaveLength(2)
    expect(ws[0]).toMatchObject({
      relPath: 'src/calculator.cpp',
      line: 20,
      column: 7,
      category: '-Wunused-variable'
    })
    expect(ws[1]).toMatchObject({ relPath: 'src/strutil.cpp', line: 8, column: null })
  })

  it('parses MSVC warnings', () => {
    const log = 'C:\\proj\\src\\calc.cpp(42): warning C4101: unreferenced local variable'
    const ws = parseWarnings(log)
    expect(ws).toHaveLength(1)
    expect(ws[0]).toMatchObject({ line: 42, category: 'C4101' })
    expect(ws[0]!.message).toContain('unreferenced local variable')
  })

  it('makes absolute compiler paths relative to the clone dir', () => {
    const log = '/tmp/clone/src/foo.c:3:1: warning: implicit declaration [-Wimplicit]'
    const ws = parseWarnings(log, '/tmp/clone')
    expect(ws[0]!.relPath).toBe('src/foo.c')
  })

  it('deduplicates identical warnings', () => {
    const line = 'src/a.c:1:1: warning: x [-Wfoo]'
    const ws = parseWarnings([line, line].join('\n'))
    expect(ws).toHaveLength(1)
  })

  it('parses MSVC paths with spaces and strips the MSBuild project tag', () => {
    const log =
      'P:\\sodern_package\\Visual Studio 16 2019\\include\\osal_socket.h(39,4): warning C4201: struct sans nom [P:\\DS_COM_Dirty\\build\\ci-msvc\\libdscom.vcxproj]'
    const ws = parseWarnings(log)
    expect(ws).toHaveLength(1)
    expect(ws[0]).toMatchObject({ line: 39, column: 4, category: 'C4201' })
    expect(ws[0]!.relPath).toBe('P:/sodern_package/Visual Studio 16 2019/include/osal_socket.h')
    expect(ws[0]!.message).toBe('struct sans nom') // no trailing [..vcxproj]
  })

  it('strips the MSBuild "NN>" node prefix', () => {
    const ws = parseWarnings('12>P:\\src\\a.c(7,3): warning C4100: x [P:\\b\\x.vcxproj]')
    expect(ws).toHaveLength(1)
    expect(ws[0]!.relPath).toBe('P:/src/a.c')
  })

  it('collapses MSVC caret/source-context lines at the same location', () => {
    const log = [
      'P:\\src\\a.c(422,40): warning C4100: argv non reference [P:\\b\\x.vcxproj]',
      'P:\\src\\a.c(422,40): warning C4100: TypC32 stop_nav(int argc, const char **argv) [P:\\b\\x.vcxproj]',
      'P:\\src\\a.c(422,40): warning C4100:    ^ [P:\\b\\x.vcxproj]'
    ].join('\n')
    const ws = parseWarnings(log)
    expect(ws).toHaveLength(1)
    expect(ws[0]!.message).toBe('argv non reference') // first line = real message
  })

  it('keeps identical messages on different lines as distinct (occurrence index)', () => {
    const log = [
      'P:\\src\\a.c(422,40): warning C4100: argv non reference [P:\\b\\x.vcxproj]',
      'P:\\src\\a.c(441,43): warning C4100: argv non reference [P:\\b\\x.vcxproj]',
      'P:\\src\\a.c(451,44): warning C4100: argv non reference [P:\\b\\x.vcxproj]'
    ].join('\n')
    const ws = parseWarnings(log)
    expect(ws).toHaveLength(3)
    expect(ws.map((w) => w.occurrence)).toEqual([0, 1, 2])
    expect(new Set(ws.map(warningKey)).size).toBe(3)
  })
})

describe('groupByFile', () => {
  it('groups warnings by relative path', () => {
    const ws = parseWarnings(
      [
        'src/a.c:1: warning: m1 [-Wa]',
        'src/a.c:2: warning: m2 [-Wb]',
        'src/b.c:1: warning: m3 [-Wc]'
      ].join('\n')
    )
    const g = groupByFile(ws)
    expect(g.get('src/a.c')).toHaveLength(2)
    expect(g.get('src/b.c')).toHaveLength(1)
  })
})

describe('diffWarnings', () => {
  it('tracks fixed / remaining / introduced regardless of line shifts', () => {
    const before = parseWarnings(
      [
        'src/a.c:10: warning: unused x [-Wunused]',
        'src/a.c:20: warning: sign mismatch [-Wsign]'
      ].join('\n')
    )
    // After: the unused one is gone; the sign one moved lines (same key); a new one appeared.
    const after = parseWarnings(
      ['src/a.c:18: warning: sign mismatch [-Wsign]', 'src/a.c:30: warning: new one [-Wnew]'].join(
        '\n'
      )
    )
    const d = diffWarnings(before, after)
    expect(d.fixed.map((w) => w.message)).toEqual(['unused x'])
    expect(d.remaining.map(warningKey)).toEqual(['src/a.c|-Wsign|sign mismatch|0'])
    expect(d.introduced.map((w) => w.message)).toEqual(['new one'])
  })
})

describe('buildWarningPrSummary / stripAstral', () => {
  it('removes astral-plane characters (4-byte emoji that break Tuleap)', async () => {
    const { stripAstral, buildWarningPrSummary } =
      await import('../../src/main/warning-corrector/warning-corrector')
    expect(stripAstral('a🛠️b🚀c')).toBe('a️bc') // U+FE0F (BMP) kept, astral removed
    const ws = parseWarnings('src/a.c:3:7: warning: unused x [-Wunused-variable]')
    const summary = buildWarningPrSummary({
      changedFiles: ['/clone/src/a.c'],
      fixed: ws,
      remaining: [],
      initialCount: 1,
      iterations: 1,
      warnings: []
    })
    // No code point outside the BMP must remain in the PR payload.
    expect(/[\u{10000}-\u{10FFFF}]/u.test(summary)).toBe(false)
    expect(summary).toContain('unused x')
  })
})
