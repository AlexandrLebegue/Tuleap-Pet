import fs from 'node:fs'
import path from 'node:path'
import { resolveLlmProvider } from '../llm'
import { buildContext, buildProjectIndex, parseFile } from '../cpp-analyzer'
import type { FunctionDef, ProjectIndex } from '../cpp-analyzer/types'
import { buildFirstShotPrompt, buildRepairPrompt, extractCppBlock } from './context-prompts'
import { discoverTests } from './test-discovery'
import type { TestDiscovery, TestMarker } from './test-discovery'
import { discoverCMake } from './cmake-discovery'
import { updateCMakeLists } from './cmake-updater'
import { runCMakeWorkflow, summarizeBuildFailure } from './build-runner'
import type { BuildResult } from './build-runner'

export type PipelineProgress =
  | { type: 'index'; root: string }
  | { type: 'discover'; testDir: string | null; templateFile: string | null; marker: TestMarker | null }
  | { type: 'generate'; functionName: string; index: number; total: number }
  | { type: 'write'; filePath: string }
  | { type: 'cmake-update'; cmakeFile: string; inserted: string[] }
  | { type: 'build-start'; preset: string; iteration: number }
  | { type: 'build-result'; ok: boolean; iteration: number; durationMs: number }
  | { type: 'repair'; iteration: number; failingFiles: string[] }
  | { type: 'done' }

export type PipelineOptions = {
  projectRoot: string
  /** Absolute path of the source file the user wants tested. */
  sourceFilePath: string
  /** When provided, restrict generation to a subset of functions (simple names). */
  onlyFunctions?: string[]
  /** Run `cmake --workflow --preset <preset>` after writing tests. */
  buildEnabled: boolean
  /** Workflow preset name from CMakePresets.json (default `ci-gcc`). */
  preset?: string
  /** Number of repair iterations allowed when build fails (default 3). */
  maxRepairs?: number
  /** Override generated file directory (default: discovered tests/ dir). */
  testDirOverride?: string
  /** Token budget for enriched context (default 12000). */
  tokenBudget?: number
  /** BFS depth for callers/callees (default 3). */
  depth?: number
}

export type GeneratedTestFile = {
  filePath: string
  functionName: string
  content: string
  /** Iteration where this file was last (re-)generated. 1 = first shot. */
  iteration: number
}

export type PipelineResult = {
  testFiles: GeneratedTestFile[]
  discovery: TestDiscovery
  cmakeFile: string | null
  cmakeInserted: string[]
  build: BuildResult | null
  iterations: number
  warnings: string[]
}

function sanitizeBasename(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+|_+$/g, '')
}

async function callLlm(system: string, user: string, maxOutputTokens = 4096): Promise<string> {
  const provider = resolveLlmProvider()
  const result = await provider.generate({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.3,
    maxOutputTokens
  })
  return result.text
}

async function generateForFunction(
  index: ProjectIndex,
  fn: FunctionDef,
  discovery: TestDiscovery,
  opts: PipelineOptions
): Promise<{ filePath: string; content: string }> {
  const context = buildContext(index, fn, {
    depth: opts.depth,
    tokenBudget: opts.tokenBudget
  })
  const testDir = opts.testDirOverride ?? discovery.testDir ?? path.join(opts.projectRoot, 'tests')
  const fileName = `test_${sanitizeBasename(fn.name)}.cpp`
  const filePath = path.join(testDir, fileName)

  let templateContent: string | null = null
  if (discovery.templateFile) {
    try {
      templateContent = fs.readFileSync(discovery.templateFile, 'utf8')
    } catch {
      templateContent = null
    }
  }
  const marker = discovery.marker ?? 'gtest'
  const { system, user } = buildFirstShotPrompt({
    context,
    marker,
    templatePath: discovery.templateFile
      ? path.relative(opts.projectRoot, discovery.templateFile)
      : null,
    templateContent,
    relativeSourcePath: path.relative(opts.projectRoot, fn.filePath),
    testFileName: fileName
  })
  const raw = await callLlm(system, user)
  const content = extractCppBlock(raw)
  return { filePath, content }
}

async function repairFile(
  filePath: string,
  previousContent: string,
  buildSummary: string,
  iteration: number,
  maxRepairs: number
): Promise<string> {
  const { system, user } = buildRepairPrompt({
    testFileName: path.basename(filePath),
    previousContent,
    buildSummary,
    iteration,
    maxIterations: maxRepairs
  })
  const raw = await callLlm(system, user)
  return extractCppBlock(raw)
}

function functionsToTarget(
  filePath: string,
  fileContent: string,
  onlyFunctions: string[] | undefined
): FunctionDef[] {
  const defs = parseFile(filePath, fileContent)
  if (!onlyFunctions || onlyFunctions.length === 0) return defs
  const wanted = new Set(onlyFunctions)
  return defs.filter((d) => wanted.has(d.name))
}

function failingFilesFromBuild(
  build: BuildResult,
  produced: GeneratedTestFile[]
): GeneratedTestFile[] {
  if (build.ok) return []
  const offending = new Set<string>()
  for (const e of build.errors) {
    if (!e.filePath) continue
    const base = path.basename(e.filePath)
    for (const p of produced) {
      if (path.basename(p.filePath) === base) offending.add(p.filePath)
    }
  }
  // If we couldn't match errors to specific files, re-attempt all of them —
  // most LLM-induced failures are localized to one of the generated files.
  if (offending.size === 0) return produced
  return produced.filter((p) => offending.has(p.filePath))
}

export async function runPipeline(
  opts: PipelineOptions,
  onProgress?: (e: PipelineProgress) => void
): Promise<PipelineResult> {
  const warnings: string[] = []
  const preset = opts.preset ?? 'ci-gcc'
  const maxRepairs = Math.max(0, Math.min(5, opts.maxRepairs ?? 3))

  onProgress?.({ type: 'index', root: opts.projectRoot })
  const index = buildProjectIndex(opts.projectRoot)

  const sourceContent = fs.readFileSync(opts.sourceFilePath, 'utf8')
  const targets = functionsToTarget(opts.sourceFilePath, sourceContent, opts.onlyFunctions)
  if (targets.length === 0) {
    return {
      testFiles: [],
      discovery: { testDir: null, templateFile: null, hits: [], marker: null },
      cmakeFile: null,
      cmakeInserted: [],
      build: null,
      iterations: 0,
      warnings: ['No functions extracted from source file.']
    }
  }

  const discovery = discoverTests(opts.projectRoot)
  onProgress?.({
    type: 'discover',
    testDir: discovery.testDir,
    templateFile: discovery.templateFile,
    marker: discovery.marker
  })
  if (!discovery.testDir) {
    warnings.push('No existing test directory detected — falling back to <project>/tests.')
  }

  // Ensure the test directory exists.
  const testDir = opts.testDirOverride ?? discovery.testDir ?? path.join(opts.projectRoot, 'tests')
  try {
    fs.mkdirSync(testDir, { recursive: true })
  } catch (err) {
    warnings.push(`Could not create test dir ${testDir}: ${(err as Error).message}`)
  }

  // First-shot generation for each target.
  const produced: GeneratedTestFile[] = []
  for (let i = 0; i < targets.length; i++) {
    const fn = targets[i]!
    onProgress?.({ type: 'generate', functionName: fn.name, index: i + 1, total: targets.length })
    const { filePath, content } = await generateForFunction(index, fn, discovery, opts)
    fs.writeFileSync(filePath, content, 'utf8')
    onProgress?.({ type: 'write', filePath })
    produced.push({ filePath, functionName: fn.name, content, iteration: 1 })
  }

  // CMake update.
  let cmakeFile: string | null = null
  let cmakeInserted: string[] = []
  if (discovery.templateFile) {
    const cm = discoverCMake(discovery.templateFile, opts.projectRoot)
    cmakeFile = cm.cmakeFile
    if (cm.cmakeFile && cm.mode) {
      const newSources = produced.map((p) =>
        path.relative(path.dirname(cm.cmakeFile!), p.filePath)
      )
      const upd = updateCMakeLists(cm.cmakeFile, cm.mode, newSources)
      if (upd.ok) {
        cmakeInserted = upd.inserted
        onProgress?.({
          type: 'cmake-update',
          cmakeFile: cm.cmakeFile,
          inserted: cmakeInserted
        })
      } else {
        warnings.push(`CMake update failed: ${upd.reason}`)
      }
    } else {
      warnings.push('No suitable add_executable/target_sources block found in CMakeLists.txt.')
    }
  } else {
    warnings.push('No template test file — CMakeLists not updated. Manual edit required.')
  }

  // Build + self-repair loop.
  let build: BuildResult | null = null
  let iterations = 0
  if (opts.buildEnabled) {
    for (let i = 1; i <= 1 + maxRepairs; i++) {
      iterations = i
      onProgress?.({ type: 'build-start', preset, iteration: i })
      build = await runCMakeWorkflow({ preset, cwd: opts.projectRoot })
      onProgress?.({ type: 'build-result', ok: build.ok, iteration: i, durationMs: build.durationMs })
      if (build.ok) break
      if (i > maxRepairs) break

      const failing = failingFilesFromBuild(build, produced)
      onProgress?.({ type: 'repair', iteration: i, failingFiles: failing.map((f) => f.filePath) })
      const summary = summarizeBuildFailure(build)
      for (const f of failing) {
        const newContent = await repairFile(f.filePath, f.content, summary, i, maxRepairs)
        fs.writeFileSync(f.filePath, newContent, 'utf8')
        f.content = newContent
        f.iteration = i + 1
      }
    }
  }

  onProgress?.({ type: 'done' })
  return {
    testFiles: produced,
    discovery,
    cmakeFile,
    cmakeInserted,
    build,
    iterations,
    warnings
  }
}
