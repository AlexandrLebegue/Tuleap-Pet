import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { updateCMakeLists } from '../../src/main/test-generator/cmake-updater'

const SAMPLE_BLOCK = `cmake_minimum_required(VERSION 3.25)

add_executable(cpp_demo_tests
  test_calculator.cpp
)

target_link_libraries(cpp_demo_tests PRIVATE cpp_demo_lib GTest::gtest_main)
`

describe('updateCMakeLists', () => {
  let tmp: string
  let cmakeFile: string
  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'cmake-update-'))
    cmakeFile = path.join(tmp, 'CMakeLists.txt')
    writeFileSync(cmakeFile, SAMPLE_BLOCK, 'utf8')
  })
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('inserts a new source inside the matching add_executable block', () => {
    const res = updateCMakeLists(
      cmakeFile,
      { kind: 'add_executable', target: 'cpp_demo_tests' },
      ['test_average.cpp']
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.inserted).toEqual(['test_average.cpp'])
      const updated = readFileSync(cmakeFile, 'utf8')
      expect(updated).toContain('test_calculator.cpp')
      expect(updated).toContain('test_average.cpp')
      // The closing paren must still terminate the block on its own line.
      expect(updated).toMatch(/test_average\.cpp\s*\n\)/)
    }
  })

  it('is idempotent for sources already present in the block', () => {
    const res = updateCMakeLists(
      cmakeFile,
      { kind: 'add_executable', target: 'cpp_demo_tests' },
      ['test_calculator.cpp']
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.inserted).toEqual([])
      const updated = readFileSync(cmakeFile, 'utf8')
      expect(updated).toBe(SAMPLE_BLOCK)
    }
  })

  it('preserves the existing indentation when appending', () => {
    const fourSpaceIndent = `add_executable(cpp_demo_tests
    test_calculator.cpp
)
`
    writeFileSync(cmakeFile, fourSpaceIndent, 'utf8')
    const res = updateCMakeLists(
      cmakeFile,
      { kind: 'add_executable', target: 'cpp_demo_tests' },
      ['test_x.cpp']
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      const updated = readFileSync(cmakeFile, 'utf8')
      expect(updated).toMatch(/\n {4}test_x\.cpp/)
    }
  })

  it('refuses to edit when no matching block is found', () => {
    const res = updateCMakeLists(
      cmakeFile,
      { kind: 'add_executable', target: 'does_not_exist' },
      ['test_x.cpp']
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/no .* block found/)
  })

  it('supports dry-run (does not write to disk)', () => {
    const res = updateCMakeLists(
      cmakeFile,
      { kind: 'add_executable', target: 'cpp_demo_tests' },
      ['test_dry.cpp'],
      { dryRun: true }
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.after).toContain('test_dry.cpp')
      const onDisk = readFileSync(cmakeFile, 'utf8')
      expect(onDisk).not.toContain('test_dry.cpp')
    }
  })
})
