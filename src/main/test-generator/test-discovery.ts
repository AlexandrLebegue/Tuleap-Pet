import fs from 'node:fs'
import path from 'node:path'

const TEST_FILE_EXTS = ['.cpp', '.cc', '.cxx', '.c']

const SKIP_DIRS = new Set([
  '.git', '.svn', '.hg',
  'node_modules', 'dist', 'out', 'build',
  'cmake-build', 'cmake-build-debug', 'cmake-build-release',
  '_deps', 'CMakeFiles',
  '.cache', '.idea', '.vscode', '.vs',
  'third_party', 'external', 'vendor', 'extern'
])

const GTEST_MARKERS = [
  /#\s*include\s*[<"]gtest\/gtest\.h[>"]/,
  /\bTEST\s*\(/,
  /\bTEST_F\s*\(/,
  /\bTEST_P\s*\(/,
  /\bRUN_ALL_TESTS\s*\(/,
  /\bgtest_discover_tests\s*\(/
]
const FFF_MARKERS = [
  /#\s*include\s*[<"]fff\.h[>"]/,
  /\bFAKE_VALUE_FUNC\s*\(/,
  /\bFAKE_VOID_FUNC\s*\(/
]

export type TestMarker = 'gtest' | 'fff' | 'gtest+fff'

export type TestFileHit = {
  filePath: string
  markers: TestMarker
  /** Number of times any marker matched (rough relevance score). */
  score: number
}

export type TestDiscovery = {
  /** Most-likely test directory, or `null` if nothing was detected. */
  testDir: string | null
  /** Best template/example test file from `testDir`. */
  templateFile: string | null
  /** All discovered test files, grouped by directory and sorted by score. */
  hits: TestFileHit[]
  /** Aggregated marker style across hits in `testDir`. */
  marker: TestMarker | null
}

function isTestExt(p: string): boolean {
  return TEST_FILE_EXTS.some((e) => p.toLowerCase().endsWith(e))
}

function scoreFile(content: string): { score: number; gtest: boolean; fff: boolean } {
  let score = 0
  let gtest = false
  let fff = false
  for (const re of GTEST_MARKERS) {
    const m = content.match(re)
    if (m) {
      score += 1
      gtest = true
    }
  }
  for (const re of FFF_MARKERS) {
    const m = content.match(re)
    if (m) {
      score += 1
      fff = true
    }
  }
  return { score, gtest, fff }
}

function walk(root: string, out: string[]): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      walk(path.join(root, e.name), out)
    } else if (e.isFile() && isTestExt(e.name)) {
      out.push(path.join(root, e.name))
    }
  }
}

export function discoverTests(projectRoot: string): TestDiscovery {
  const abs = path.resolve(projectRoot)
  const candidates: string[] = []
  walk(abs, candidates)

  const hits: TestFileHit[] = []
  for (const file of candidates) {
    let content: string
    try {
      content = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const { score, gtest, fff } = scoreFile(content)
    if (score === 0) continue
    const m: TestMarker = gtest && fff ? 'gtest+fff' : gtest ? 'gtest' : 'fff'
    hits.push({ filePath: file, markers: m, score })
  }

  if (hits.length === 0) {
    return { testDir: null, templateFile: null, hits: [], marker: null }
  }

  // Group by dir, pick the dir with the most hits (tie-broken by total score).
  const byDir = new Map<string, TestFileHit[]>()
  for (const h of hits) {
    const dir = path.dirname(h.filePath)
    const arr = byDir.get(dir)
    if (arr) arr.push(h)
    else byDir.set(dir, [h])
  }

  let bestDir = ''
  let bestCount = -1
  let bestScore = -1
  for (const [dir, arr] of byDir) {
    const totalScore = arr.reduce((s, h) => s + h.score, 0)
    if (arr.length > bestCount || (arr.length === bestCount && totalScore > bestScore)) {
      bestDir = dir
      bestCount = arr.length
      bestScore = totalScore
    }
  }

  const dirHits = (byDir.get(bestDir) ?? []).sort((a, b) => b.score - a.score)
  const template = dirHits[0] ?? null

  // Aggregate marker style across the winning directory.
  let hasGtest = false
  let hasFff = false
  for (const h of dirHits) {
    if (h.markers === 'gtest' || h.markers === 'gtest+fff') hasGtest = true
    if (h.markers === 'fff' || h.markers === 'gtest+fff') hasFff = true
  }
  const marker: TestMarker = hasGtest && hasFff ? 'gtest+fff' : hasGtest ? 'gtest' : 'fff'

  return {
    testDir: bestDir,
    templateFile: template?.filePath ?? null,
    hits: hits.sort((a, b) => b.score - a.score),
    marker
  }
}
