import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { makeMockProvider, mkTempProjectFromSample, rmTemp, setMockHandler } from './_helpers'

vi.mock('../../src/main/llm', () => ({
  resolveLlmProvider: () => makeMockProvider()
}))

// Import AFTER the mock so the pipeline picks up the mocked provider.
import { runPipeline } from '../../src/main/test-generator/pipeline'

const RUN_BUILD = process.env.RUN_E2E_BUILD === '1'

const TEST_MAX_ELEMENT_CONTENT = `\
\`\`\`cpp
#include "gtest/gtest.h"
#include "calculator.h"

#include <stdexcept>
#include <vector>

TEST(MaxElementTest, ReturnsSingleValueOnSingleton) {
  std::vector<int> v = {42};
  EXPECT_EQ(calc::max_element(v), 42);
}

TEST(MaxElementTest, ReturnsLargestInMultiValue) {
  std::vector<int> v = {3, 7, 2, 9, 4};
  EXPECT_EQ(calc::max_element(v), 9);
}

TEST(MaxElementTest, ThrowsOnEmptyVector) {
  std::vector<int> v;
  EXPECT_THROW(calc::max_element(v), std::invalid_argument);
}
\`\`\`
`

describe('TestGenerator pipeline E2E (samples/cpp-demo)', () => {
  let projectRoot: string

  beforeAll(() => {
    projectRoot = mkTempProjectFromSample('samples/cpp-demo')
  })
  afterAll(() => {
    rmTemp(projectRoot)
  })

  it('generates a test file, updates CMakeLists, and (optionally) builds successfully', async () => {
    setMockHandler(() => TEST_MAX_ELEMENT_CONTENT)

    const sourceFilePath = path.join(projectRoot, 'src/calculator.cpp')
    const events: string[] = []
    const result = await runPipeline(
      {
        projectRoot,
        sourceFilePath,
        onlyFunctions: ['max_element'],
        buildEnabled: RUN_BUILD,
        preset: 'ci-gcc',
        maxRepairs: 0
      },
      (ev) => { events.push(ev.type) }
    )

    // 1. Exactly one test file generated for the requested function.
    expect(result.testFiles).toHaveLength(1)
    expect(result.testFiles[0]!.functionName).toBe('max_element')
    const generatedPath = result.testFiles[0]!.filePath
    expect(path.basename(generatedPath)).toBe('test_max_element.cpp')

    // 2. The file was written into the discovered tests/ directory.
    expect(fs.existsSync(generatedPath)).toBe(true)
    expect(generatedPath.startsWith(path.join(projectRoot, 'tests'))).toBe(true)
    const onDisk = fs.readFileSync(generatedPath, 'utf8')
    expect(onDisk).toContain('calc::max_element')

    // 3. CMakeLists was updated with the new source (idempotently in same block).
    expect(result.cmakeFile).toBe(path.join(projectRoot, 'tests/CMakeLists.txt'))
    expect(result.cmakeInserted).toEqual(['test_max_element.cpp'])
    const cmake = fs.readFileSync(result.cmakeFile!, 'utf8')
    expect(cmake).toContain('test_calculator.cpp')
    expect(cmake).toContain('test_max_element.cpp')

    // 4. Progress events fired through the streaming channel.
    expect(events).toContain('index')
    expect(events).toContain('discover')
    expect(events).toContain('generate')
    expect(events).toContain('write')
    expect(events).toContain('cmake-update')
    expect(events).toContain('done')

    // 5. Build verification (optional — gated to keep the default suite fast).
    if (RUN_BUILD) {
      expect(result.build).not.toBeNull()
      expect(result.build!.ok).toBe(true)
      expect(result.build!.errors).toEqual([])
    }
  }, 600_000)
})
