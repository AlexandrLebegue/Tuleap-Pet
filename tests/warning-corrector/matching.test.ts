import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { buildProjectIndex } from '../../src/main/cpp-analyzer'
import { parseWarnings } from '../../src/main/warning-corrector/warning-parser'
import { matchWarnings } from '../../src/main/warning-corrector/warning-corrector'

const SAMPLE = path.resolve(__dirname, '../../samples/cpp-demo')

describe('matchWarnings (scope to selected files/functions)', () => {
  const index = buildProjectIndex(SAMPLE)
  const selection = [{ sourceFile: 'src/calculator.cpp', functions: ['add'] }]

  it('keeps a warning inside a selected function', () => {
    // add() spans lines 7-9 in calculator.cpp.
    const ws = parseWarnings('src/calculator.cpp:8:3: warning: foo [-Wfoo]')
    const matched = matchWarnings(ws, selection, index, SAMPLE)
    expect(matched).toHaveLength(1)
    expect(matched[0]!.relPath).toBe('src/calculator.cpp')
  })

  it('drops a warning inside a non-selected function of a selected file', () => {
    // multiply() spans 11-13 and is not selected.
    const ws = parseWarnings('src/calculator.cpp:12:3: warning: bar [-Wbar]')
    expect(matchWarnings(ws, selection, index, SAMPLE)).toHaveLength(0)
  })

  it('keeps a file-scope warning (outside any function) of a selected file', () => {
    // line 3 is the #include — not inside any function body.
    const ws = parseWarnings('src/calculator.cpp:3:1: warning: include [-Winc]')
    expect(matchWarnings(ws, selection, index, SAMPLE)).toHaveLength(1)
  })

  it('drops warnings in non-selected files', () => {
    const ws = parseWarnings('src/strutil.cpp:5:1: warning: baz [-Wbaz]')
    expect(matchWarnings(ws, selection, index, SAMPLE)).toHaveLength(0)
  })

  it('matches by basename when the compiler reports a build-relative path', () => {
    const ws = parseWarnings('build/../src/calculator.cpp:8:3: warning: foo [-Wfoo]')
    const matched = matchWarnings(ws, selection, index, SAMPLE)
    expect(matched).toHaveLength(1)
  })

  it('matches an absolute MSVC build path by path suffix (different machine root)', () => {
    // The build ran at P:\BUILD_ROOT; the clone is elsewhere — only the suffix matches.
    const ws = parseWarnings(
      'P:\\BUILD_ROOT\\src\\calculator.cpp(8,3): warning C4100: foo [P:\\BUILD_ROOT\\build\\x.vcxproj]'
    )
    const matched = matchWarnings(ws, selection, index, SAMPLE)
    expect(matched).toHaveLength(1)
    expect(matched[0]!.relPath).toBe('src/calculator.cpp')
  })

  it('does not match a same-basename file in a different directory when a longer suffix wins', () => {
    const sel = [
      { sourceFile: 'src/calculator.cpp', functions: ['add'] },
      { sourceFile: 'vendor/calculator.cpp', functions: ['add'] }
    ]
    const ws = parseWarnings('P:\\X\\vendor\\calculator.cpp(8,3): warning C4100: foo')
    const matched = matchWarnings(ws, sel, index, SAMPLE)
    expect(matched).toHaveLength(1)
    expect(matched[0]!.relPath).toBe('vendor/calculator.cpp')
  })
})
