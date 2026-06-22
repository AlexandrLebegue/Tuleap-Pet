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

/** Recursively (shallow, skipping heavy dirs) locate the compile script. */
export function findCompileScript(root: string, maxDepth = 4): string | null {
  const walk = (dir: string, depth: number): string | null => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return null
    }
    // Files first, honoring platform preference order.
    for (const cand of scriptCandidates()) {
      const hit = entries.find((e) => e.isFile() && e.name.toLowerCase() === cand.toLowerCase())
      if (hit) return path.join(dir, hit.name)
    }
    if (depth >= maxDepth) return null
    for (const e of entries) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue
      const found = walk(path.join(dir, e.name), depth + 1)
      if (found) return found
    }
    return null
  }
  return walk(root, 0)
}

export type CompileRunResult = {
  ok: boolean
  scriptPath: string
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
  opts: { timeoutMs?: number } = {}
): Promise<CompileRunResult> {
  const scriptPath = findCompileScript(cloneDir)
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
    warningFilePath,
    warningText,
    exitCode: res.exitCode ?? null,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    durationMs
  }
}
