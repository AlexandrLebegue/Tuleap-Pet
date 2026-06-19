import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { listCppFiles, findFilesByBasename } from '../../src/main/cpp-analyzer/fs-scan'

const SAMPLE = path.resolve(__dirname, '../../samples/cpp-demo')

describe('fs-scan', () => {
  it('lists C/C++ source and header files (absolute paths)', () => {
    const files = listCppFiles(SAMPLE)
    const rel = files.map((f) => path.relative(SAMPLE, f).replace(/\\/g, '/')).sort()
    expect(files.every((f) => path.isAbsolute(f))).toBe(true)
    expect(rel).toEqual(
      expect.arrayContaining(['src/calculator.cpp', 'src/calculator.h', 'src/strutil.cpp'])
    )
  })

  it('skips build/_deps directories', () => {
    const files = listCppFiles(SAMPLE)
    expect(files.some((f) => f.includes(`${path.sep}build${path.sep}`))).toBe(false)
    expect(files.some((f) => f.includes(`${path.sep}_deps${path.sep}`))).toBe(false)
  })

  it('resolves files by basename', () => {
    const map = findFilesByBasename(SAMPLE, new Set(['calculator.h', 'calculator.cpp']))
    expect(map.get('calculator.h')?.[0]).toMatch(/calculator\.h$/)
    expect(map.get('calculator.cpp')?.[0]).toMatch(/calculator\.cpp$/)
    expect(map.has('does-not-exist.c')).toBe(false)
  })
})
