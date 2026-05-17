import { execa } from 'execa'

export type BuildError = {
  filePath?: string
  line?: number
  column?: number
  message: string
}

export type BuildResult = {
  ok: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  errors: BuildError[]
  durationMs: number
  command: string
}

export type BuildOptions = {
  /** Workflow preset name from CMakePresets.json (e.g. `ci-gcc`). */
  preset: string
  /** Project root containing CMakeLists.txt and CMakePresets.json. */
  cwd: string
  /** Timeout in ms (default 300000 = 5 min). */
  timeoutMs?: number
}

const ERROR_LINE_RE = /^([^:\n]+\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx))(?::(\d+))?(?::(\d+))?:\s*(?:fatal\s+)?error:\s*(.+)$/i

function parseErrors(stderr: string, stdout: string): BuildError[] {
  const out: BuildError[] = []
  const seen = new Set<string>()
  for (const blob of [stderr, stdout]) {
    for (const line of blob.split('\n')) {
      const m = line.match(ERROR_LINE_RE)
      if (!m) continue
      const message = (m[4] ?? '').trim()
      const filePath = m[1]
      const lineNo = m[2] ? Number.parseInt(m[2], 10) : undefined
      const column = m[3] ? Number.parseInt(m[3], 10) : undefined
      const key = `${filePath}:${lineNo}:${column}:${message}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ filePath, line: lineNo, column, message })
    }
  }
  return out
}

export async function runCMakeWorkflow(opts: BuildOptions): Promise<BuildResult> {
  const t0 = Date.now()
  const args = ['--workflow', '--preset', opts.preset]
  const command = `cmake ${args.join(' ')}`
  try {
    const res = await execa('cmake', args, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs ?? 300_000,
      reject: false,
      all: false
    })
    const stdout = res.stdout ?? ''
    const stderr = res.stderr ?? ''
    const ok = res.exitCode === 0
    return {
      ok,
      exitCode: res.exitCode ?? null,
      stdout,
      stderr,
      errors: ok ? [] : parseErrors(stderr, stdout),
      durationMs: Date.now() - t0,
      command
    }
  } catch (err) {
    const e = err as Error & { stdout?: string; stderr?: string; exitCode?: number }
    return {
      ok: false,
      exitCode: e.exitCode ?? null,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? e.message,
      errors: parseErrors(e.stderr ?? '', e.stdout ?? ''),
      durationMs: Date.now() - t0,
      command
    }
  }
}

/**
 * Compact view of the build failure, suitable for an LLM repair prompt.
 * Truncated at ~4 KB to stay reasonable.
 */
export function summarizeBuildFailure(res: BuildResult, maxChars = 4000): string {
  if (res.ok) return ''
  const parts: string[] = []
  parts.push(`Command failed: ${res.command} (exit ${res.exitCode ?? '?'})`)
  if (res.errors.length > 0) {
    parts.push('\nCompiler errors:')
    for (const e of res.errors.slice(0, 20)) {
      const where = [e.filePath, e.line, e.column].filter(Boolean).join(':')
      parts.push(`- ${where} -> ${e.message}`)
    }
  }
  parts.push('\nLast lines of stderr:')
  const tail = res.stderr.trim().split('\n').slice(-30).join('\n')
  parts.push(tail || '(empty)')
  const text = parts.join('\n')
  return text.length > maxChars ? text.slice(0, maxChars) + '\n…(truncated)' : text
}
