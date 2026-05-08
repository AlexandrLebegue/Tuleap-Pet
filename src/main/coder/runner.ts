import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { randomUUID } from 'crypto'
import type { CoderStreamEvent } from '@shared/types'

type SessionEntry = {
  id: string
  child: ChildProcessWithoutNullStreams
  command: string
  cwd: string
}

const sessions = new Map<string, SessionEntry>()

export type SpawnCoderOpts = {
  binaryPath: string
  prompt: string
  cwd: string | null
  extraArgs?: string[]
  onEvent: (event: CoderStreamEvent) => void
}

export type SpawnCoderResult =
  | { ok: true; sessionId: string; pid: number }
  | { ok: false; error: string }

/**
 * Launch the OpenCode binary as a child process and stream stdout / stderr
 * back through `onEvent`. The default invocation is `opencode run -p
 * <prompt>` (non-interactive mode). Callers can pass extraArgs to override.
 *
 * Each call creates an independent session keyed by a uuid; killCoder()
 * terminates a running session if the user wants to stop early.
 */
export function spawnCoder(opts: SpawnCoderOpts): SpawnCoderResult {
  const id = randomUUID()
  const args = opts.extraArgs?.length ? [...opts.extraArgs] : ['run']
  args.push(opts.prompt)
  let child: ChildProcessWithoutNullStreams
  try {
    child = spawn(opts.binaryPath, args, {
      cwd: opts.cwd ?? process.cwd(),
      env: process.env,
      shell: false
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  const command = `${opts.binaryPath} ${args.map(quoteArg).join(' ')}`
  sessions.set(id, { id, child, command, cwd: opts.cwd ?? process.cwd() })

  opts.onEvent({
    type: 'started',
    sessionId: id,
    pid: child.pid ?? -1,
    command,
    cwd: opts.cwd ?? process.cwd()
  })

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    opts.onEvent({ type: 'stdout', sessionId: id, chunk })
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    opts.onEvent({ type: 'stderr', sessionId: id, chunk })
  })
  child.on('error', (err: Error) => {
    opts.onEvent({ type: 'error', sessionId: id, error: err.message })
    sessions.delete(id)
  })
  child.on('close', (code, signal) => {
    opts.onEvent({ type: 'exit', sessionId: id, code, signal: signal ?? null })
    sessions.delete(id)
  })

  return { ok: true, sessionId: id, pid: child.pid ?? -1 }
}

export function killCoder(sessionId: string): boolean {
  const session = sessions.get(sessionId)
  if (!session) return false
  try {
    session.child.kill('SIGTERM')
  } catch {
    return false
  }
  return true
}

function quoteArg(arg: string): string {
  if (arg.length === 0) return '""'
  if (/^[A-Za-z0-9._\-/]+$/.test(arg)) return arg
  return `"${arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
