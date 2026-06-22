import { execa } from 'execa'
import fs from 'node:fs'
import path from 'node:path'

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'build',
  'cmake-build',
  'cmake-build-debug',
  'cmake-build-release',
  '_deps',
  'CMakeFiles',
  'out',
  'dist'
])

/** Candidate script basenames, ordered by platform preference. */
function scriptCandidates(): string[] {
  return process.platform === 'win32'
    ? ['ai_compil.bat', 'ai_compil.cmd', 'ai_compil.sh']
    : ['ai_compil.sh', 'ai_compil.bat', 'ai_compil.cmd']
}

/** Recursively (shallow, skipping heavy dirs) locate the first compile script. */
export function findCompileScript(root: string, maxDepth = 6): string | null {
  return findCompileScripts(root, maxDepth)[0] ?? null
}

/**
 * Find every `ai_compil` script under `root` (shallow walk, skipping heavy dirs).
 * Returns absolute paths sorted shallowest-first. When a directory holds several
 * candidates, the platform-preferred extension wins.
 */
export function findCompileScripts(root: string, maxDepth = 6): string[] {
  const found: string[] = []
  const walk = (dir: string, depth: number): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    // At most one script per directory, honoring platform preference order.
    for (const cand of scriptCandidates()) {
      const hit = entries.find((e) => e.isFile() && e.name.toLowerCase() === cand.toLowerCase())
      if (hit) {
        found.push(path.join(dir, hit.name))
        break
      }
    }
    if (depth >= maxDepth) return
    for (const e of entries) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue
      walk(path.join(dir, e.name), depth + 1)
    }
  }
  walk(root, 0)
  // Shallowest first (fewest path separators), then alphabetical for stability.
  return found.sort((a, b) => {
    const da = a.split(path.sep).length
    const db = b.split(path.sep).length
    return da !== db ? da - db : a.localeCompare(b)
  })
}

/** Number of leading path segments shared by two absolute directories. */
function commonSegments(a: string, b: string): number {
  const sa = path.resolve(a).split(path.sep)
  const sb = path.resolve(b).split(path.sep)
  let n = 0
  while (n < sa.length && n < sb.length && sa[n] === sb[n]) n++
  return n
}

/**
 * Pick the script "closest" to `fileAbs`: the deepest script directory that is an
 * ancestor of the file. When no script is an ancestor (file lives outside every
 * script subtree), fall back to the script sharing the longest path prefix.
 */
export function findNearestScript(fileAbs: string, scripts: string[]): string | null {
  if (scripts.length === 0) return null
  const fileDir = path.dirname(path.resolve(fileAbs))

  let best: string | null = null
  let bestDepth = -1
  for (const s of scripts) {
    const sDir = path.resolve(path.dirname(s))
    const rel = path.relative(sDir, fileDir)
    const isAncestor = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
    if (!isAncestor) continue
    const depth = sDir.split(path.sep).length
    if (depth > bestDepth) {
      bestDepth = depth
      best = s
    }
  }
  if (best) return best

  // No ancestor script — choose the one with the longest shared path prefix.
  let bestCommon = -1
  for (const s of scripts) {
    const common = commonSegments(path.dirname(s), fileDir)
    if (common > bestCommon) {
      bestCommon = common
      best = s
    }
  }
  return best
}

export type CompileRunResult = {
  ok: boolean
  scriptPath: string
  /** Directory the script was run from (its own folder). */
  scriptDir: string
  warningFilePath: string
  /** Raw contents of the generated warning.txt. */
  warningText: string
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
}

function buildCommand(scriptPath: string): { file: string; args: string[] } {
  const lower = scriptPath.toLowerCase()
  if (lower.endsWith('.bat') || lower.endsWith('.cmd')) {
    if (process.platform === 'win32') return { file: 'cmd', args: ['/c', scriptPath] }
    // Best-effort on non-Windows: many ai_compil.bat are thin wrappers; try sh.
    return { file: 'sh', args: [scriptPath] }
  }
  // .sh
  return { file: 'bash', args: [scriptPath] }
}

/**
 * Locate the freshly generated warning.txt: next to the script first, then at the
 * clone root. Returns the first existing path (or the script-dir candidate).
 */
function resolveWarningFile(scriptPath: string, cloneDir: string): string {
  const scriptDir = path.dirname(scriptPath)
  const candidates = [
    path.join(scriptDir, 'warning.txt'),
    path.join(cloneDir, 'warning.txt'),
    path.join(scriptDir, 'warnings.txt'),
    path.join(cloneDir, 'warnings.txt')
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return candidates[0]!
}

/**
 * Run the repo's `ai_compil` script to (re)generate `warning.txt`. The script is
 * responsible for compiling and writing the warning log; we only execute it and
 * read the produced file. Throws when no script is found.
 */
export async function runCompileScript(
  cloneDir: string,
  opts: { timeoutMs?: number; scriptPath?: string } = {}
): Promise<CompileRunResult> {
  const scriptPath = opts.scriptPath ?? findCompileScript(cloneDir)
  if (!scriptPath) {
    throw new Error(
      "Aucun script de compilation 'ai_compil.sh'/'ai_compil.bat' trouvé dans le dépôt."
    )
  }
  const scriptDir = path.dirname(scriptPath)
  const { file, args } = buildCommand(scriptPath)

  // Make the .sh executable when possible (cloned files may lose the +x bit).
  if (file === 'bash' || file === 'sh') {
    try {
      fs.chmodSync(scriptPath, 0o755)
    } catch {
      /* ignore */
    }
  }

  const t0 = Date.now()
  const res = await execa(file, args, {
    cwd: scriptDir,
    timeout: opts.timeoutMs ?? 600_000,
    reject: false,
    all: false
  })
  const durationMs = Date.now() - t0

  const warningFilePath = resolveWarningFile(scriptPath, cloneDir)
  let warningText = ''
  try {
    warningText = fs.readFileSync(warningFilePath, 'utf8')
  } catch {
    // The script ran but produced no warning file — surface stderr/stdout instead.
    warningText = ''
  }

  return {
    ok: res.exitCode === 0,
    scriptPath,
    scriptDir,
    warningFilePath,
    warningText,
    exitCode: res.exitCode ?? null,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    durationMs
  }
}
