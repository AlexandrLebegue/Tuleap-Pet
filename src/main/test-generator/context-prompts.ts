import type { EnrichedContext } from '../cpp-analyzer/types'
import { renderContext } from '../cpp-analyzer'
import type { TestMarker } from './test-discovery'

const FRAMEWORK_LABEL: Record<TestMarker, string> = {
  gtest: 'GoogleTest',
  fff: 'Fake Function Framework + GoogleTest',
  'gtest+fff': 'GoogleTest with FFF mocks'
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '\n…(truncated)'
}

export type FirstShotPromptArgs = {
  context: EnrichedContext
  marker: TestMarker
  templatePath: string | null
  templateContent: string | null
  /** Relative path of the source file the target lives in, from project root. */
  relativeSourcePath: string
  /** Suggested test file basename (e.g. `test_average.cpp`). */
  testFileName: string
}

const SYSTEM_PROMPT = `You are an expert C++ test engineer specialising in GoogleTest, FFF, and
disciplined unit-test design for embedded/industrial C++ code. You receive
rich static context (target function, paired header, callers, callees) and
produce a single, complete test source file that compiles and links against
the project's existing test target.`

export function buildFirstShotPrompt(args: FirstShotPromptArgs): { system: string; user: string } {
  const framework = FRAMEWORK_LABEL[args.marker]
  const ctxText = renderContext(args.context)
  const templateBlock = args.templateContent && args.templatePath
    ? `\n## Existing test conventions (template)\nFile: ${args.templatePath}\n\n\`\`\`cpp\n${truncate(args.templateContent, 4000)}\n\`\`\`\n`
    : '\n(No template test file was found in the project — follow standard GoogleTest conventions.)\n'

  const user = `# CONTEXT

${ctxText}
${templateBlock}

# YOUR TASK

Write a complete C++ test file named **${args.testFileName}** for the target
function above. Cover:
- nominal cases derived from the function's normal behavior,
- edge cases implied by the callees (e.g. empty containers, zero values),
- boundary / error conditions implied by the target's contract,
- callers' usage patterns where they constrain expected output.

Use **${framework}**. Required constraints:
- Match the template's #include style, namespacing, and macro convention.
- Do **NOT** write a \`main()\` — the existing test target links against
  \`GTest::gtest_main\` (or equivalent).
- Use \`TEST(SuiteName, CaseName)\` (or \`TEST_F\` if the template uses fixtures).
- Reference \`${args.context.target.qualifiedName}\` exactly as it is defined
  (preserve namespaces).
- Only include headers that the project already exposes — do not invent
  third-party dependencies.

Output ONLY the C++ source between \`\`\`cpp and \`\`\`. No commentary, no
Markdown headings, no leading or trailing prose.`

  return { system: SYSTEM_PROMPT, user }
}

export type RepairPromptArgs = {
  testFileName: string
  previousContent: string
  buildSummary: string
  iteration: number
  maxIterations: number
}

export function buildRepairPrompt(args: RepairPromptArgs): { system: string; user: string } {
  const user = `Attempt ${args.iteration}/${args.maxIterations} — the previous test file failed to
build. Fix it.

# BUILD OUTPUT

${truncate(args.buildSummary, 4000)}

# PREVIOUS FILE (${args.testFileName})

\`\`\`cpp
${args.previousContent}
\`\`\`

# YOUR TASK

Produce a corrected version of **${args.testFileName}** that addresses the
errors above. Same constraints as the original task: no \`main()\`,
GoogleTest-only, no new third-party dependencies, keep test names stable
where possible.

Output ONLY the C++ source between \`\`\`cpp and \`\`\`. No commentary.`

  return { system: SYSTEM_PROMPT, user }
}

export function extractCppBlock(text: string): string {
  const patterns = [/```cpp\s*([\s\S]*?)```/, /```c\+\+\s*([\s\S]*?)```/, /```c\s*([\s\S]*?)```/, /```\s*([\s\S]*?)```/]
  for (const p of patterns) {
    const m = text.match(p)
    if (m?.[1]) return m[1].trim() + '\n'
  }
  return text.trim() + '\n'
}
