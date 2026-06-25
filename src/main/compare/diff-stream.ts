import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { createDiffStatsAccumulator, type DiffStats } from './diff-utils'

export type StreamedDiff = {
  /** Captured diff text, capped at `displayBudget` chars. */
  diff: string
  /** True when the diff was larger than `displayBudget` (the rest was streamed but not kept). */
  truncated: boolean
  /** Exact stats computed over the FULL stream (not just the captured slice). */
  stats: DiffStats
}

/**
 * Run a diff command (`git diff …` / `svn diff …`) and read its stdout as a
 * **stream**, so an arbitrarily large diff never overflows a fixed `execFile`
 * `maxBuffer`. Stats are accumulated over every line of the full output, while
 * only the first `displayBudget` characters are retained for display.
 *
 * `args` must be the complete argument list (the caller adds `--non-interactive`
 * for svn, `-C <dir>` for git, etc.).
 */
export function streamDiff(
  bin: string,
  args: string[],
  displayBudget: number
): Promise<StreamedDiff> {
  return new Promise<StreamedDiff>((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true })
    const acc = createDiffStatsAccumulator()
    const kept: string[] = []
    let keptLen = 0
    let truncated = false
    let stderr = ''

    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity })

    rl.on('line', (line) => {
      acc.push(line)
      if (!truncated) {
        // +1 accounts for the '\n' re-joined on display.
        if (keptLen + line.length + 1 > displayBudget) truncated = true
        else {
          kept.push(line)
          keptLen += line.length + 1
        }
      }
    })

    child.stderr.on('data', (d: Buffer) => {
      if (stderr.length < 8192) stderr += d.toString()
    })

    child.on('error', (err) => reject(err))

    child.on('close', (code) => {
      // git/svn diff exit 0 on success (no --exit-code). Non-zero = real error.
      if (code !== 0 && code !== null) {
        reject(
          new Error(stderr.trim() || `${bin} ${args[0] ?? 'diff'} a quitté avec le code ${code}`)
        )
        return
      }
      resolve({ diff: kept.join('\n'), truncated, stats: acc.result() })
    })
  })
}
