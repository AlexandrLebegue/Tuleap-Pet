import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { buildHeaderIndex } from '../../src/main/test-generator/header-index'

const SAMPLE = path.resolve(__dirname, '../../samples/cpp-demo')

describe('buildHeaderIndex on samples/cpp-demo', () => {
  const headers = buildHeaderIndex(SAMPLE)

  it('lists headers with their functions', () => {
    const calc = headers.find((h) => h.headerPath === 'src/calculator.h')
    expect(calc, 'calculator.h should be indexed').toBeDefined()
    const names = calc!.functions.map((f) => f.name).sort()
    expect(names).toEqual(expect.arrayContaining(['add', 'multiply', 'square', 'sum']))
  })

  it('points each declared function to its implementation file', () => {
    const calc = headers.find((h) => h.headerPath === 'src/calculator.h')!
    const add = calc.functions.find((f) => f.name === 'add')!
    expect(add.implFile).toBe('src/calculator.cpp')
    expect(add.inHeader).toBe(false)
    expect(add.implLine).toBeGreaterThan(0)
  })

  it('uses paths relative to the clone dir', () => {
    for (const h of headers) {
      expect(path.isAbsolute(h.headerPath)).toBe(false)
      for (const fn of h.functions) {
        expect(path.isAbsolute(fn.implFile)).toBe(false)
      }
    }
  })
})
