import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { discoverTests } from '../../src/main/test-generator/test-discovery'
import { discoverCMake } from '../../src/main/test-generator/cmake-discovery'

const SAMPLE = path.resolve(__dirname, '../../samples/cpp-demo')

describe('discoverTests on samples/cpp-demo', () => {
  it('finds the tests/ directory and the seed test file', () => {
    const res = discoverTests(SAMPLE)
    expect(res.testDir).toBe(path.join(SAMPLE, 'tests'))
    expect(res.templateFile).toBe(path.join(SAMPLE, 'tests/test_calculator.cpp'))
    expect(res.marker).toBe('gtest')
    expect(res.hits.length).toBeGreaterThan(0)
  })

  it('ignores files inside build/ even if they look like tests', () => {
    const res = discoverTests(SAMPLE)
    for (const h of res.hits) {
      expect(h.filePath.includes(`${path.sep}build${path.sep}`)).toBe(false)
      expect(h.filePath.includes(`${path.sep}_deps${path.sep}`)).toBe(false)
    }
  })
})

describe('discoverCMake on samples/cpp-demo', () => {
  it('locates tests/CMakeLists.txt and reads the add_executable target', () => {
    const testFile = path.join(SAMPLE, 'tests/test_calculator.cpp')
    const cm = discoverCMake(testFile, SAMPLE)
    expect(cm.cmakeFile).toBe(path.join(SAMPLE, 'tests/CMakeLists.txt'))
    expect(cm.mode?.kind).toBe('add_executable')
    if (cm.mode?.kind === 'add_executable') {
      expect(cm.mode.target).toBe('cpp_demo_tests')
    }
    expect(cm.existingSources).toContain('test_calculator.cpp')
  })

  it('falls back to nearest CMakeLists when no file mentions the target', () => {
    const fakeTest = path.join(SAMPLE, 'tests/test_phantom.cpp')
    const cm = discoverCMake(fakeTest, SAMPLE)
    expect(cm.cmakeFile).toBe(path.join(SAMPLE, 'tests/CMakeLists.txt'))
    expect(cm.mode?.kind).toBe('append')
  })
})
