import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { buildProjectIndex } from '../../src/main/cpp-analyzer'
import { parseWarnings } from '../../src/main/warning-corrector/warning-parser'
import { matchWarnings } from '../../src/main/warning-corrector/warning-corrector'

const SAMPLE = path.resolve(__dirname, '../../samples/cpp-demo')

// Repo file universe = the clone's own source files (what runWarningCorrector passes).
const repoFiles = buildProjectIndex(SAMPLE).files.map((f) =>
  path.relative(SAMPLE, f).replace(/\\/g, '/')
)

describe('matchWarnings (repo-wide, third-party excluded)', () => {
  it('keeps a warning anywhere in a repo file, regardless of the function', () => {
    // Inside add() …
    expect(
      matchWarnings(parseWarnings('src/calculator.cpp:8:3: warning: foo [-Wfoo]'), repoFiles)
    ).toHaveLength(1)
    // … and inside another function of the same file (no function-level dropping).
    const ws = matchWarnings(
      parseWarnings('src/calculator.cpp:12:3: warning: bar [-Wbar]'),
      repoFiles
    )
    expect(ws).toHaveLength(1)
    expect(ws[0]!.relPath).toBe('src/calculator.cpp')
  })

  it('keeps a file-scope warning (outside any function)', () => {
    const ws = parseWarnings('src/calculator.cpp:3:1: warning: include [-Winc]')
    expect(matchWarnings(ws, repoFiles)).toHaveLength(1)
  })

  it('keeps warnings in any repo file, even header-less ones the selection never surfaced', () => {
    const ws = parseWarnings('src/strutil.cpp:5:1: warning: baz [-Wbaz]')
    expect(matchWarnings(ws, repoFiles)).toHaveLength(1)
  })

  it('excludes third-party warnings whose file lives outside the clone', () => {
    const ws = parseWarnings(
      'P:\\sodern_package\\Visual Studio 16 2019\\include\\osal_socket.h(39,4): warning C4201: x'
    )
    expect(matchWarnings(ws, repoFiles)).toHaveLength(0)
  })

  it('matches an absolute MSVC build path by path suffix (different machine root)', () => {
    const ws = parseWarnings(
      'P:\\DS_COM_Dirty\\src\\calculator.cpp(8,3): warning C4100: foo [P:\\DS_COM_Dirty\\build\\x.vcxproj]'
    )
    const matched = matchWarnings(ws, repoFiles)
    expect(matched).toHaveLength(1)
    expect(matched[0]!.relPath).toBe('src/calculator.cpp')
  })

  it('matches a build-relative path', () => {
    const ws = parseWarnings('build/../src/calculator.cpp:8:3: warning: foo [-Wfoo]')
    expect(matchWarnings(ws, repoFiles)).toHaveLength(1)
  })

  it('disambiguates same-basename files by the longest path suffix', () => {
    const files = ['src/calculator.cpp', 'vendor/calculator.cpp']
    const ws = parseWarnings('P:\\X\\vendor\\calculator.cpp(8,3): warning C4100: foo')
    const matched = matchWarnings(ws, files)
    expect(matched).toHaveLength(1)
    expect(matched[0]!.relPath).toBe('vendor/calculator.cpp')
  })
})
