import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { createDiffStatsAccumulator, type DiffStats } from './diff-utils'
import { classifyDiffPath, includeInSample, dirBucket, type FileCategory } from './file-classify'
import type { DiffFileBreakdown } from '@shared/types'

export type StreamDiffOptions = {
  /** Max chars of raw diff kept for display. */
  displayBudget: number
  /** Max chars of the denoised source/test sample fed to the LLM. */
  sampleBudget: number
  /** Max chars taken from any single file into the sample (keeps breadth). */
  perFileBudget: number
}

export const DEFAULT_STREAM_OPTIONS: StreamDiffOptions = {
  displayBudget: 200_000,
  sampleBudget: 120_000,
  perFileBudget: 4_000
}

export type StreamedDiff = {
  /** Captured raw diff text, capped at `displayBudget` chars. */
  diff: string
  /** True when the diff was larger than `displayBudget`. */
  truncated: boolean
  /** Exact stats computed over the FULL stream (not just the captured slice). */
  stats: DiffStats
  /**
   * Denoised sample: hunks from **source/test files only** (generated/vendored/
   * build files excluded), each file capped to keep breadth across the change.
   * This is the high-signal input for the AI summary.
   */
  sourceSample: string
  /** True when the source sample hit its budget (more source changes exist). */
  sourceSampleTruncated: boolean
  /** File-category breakdown + most-touched directories. */
  breakdown: DiffFileBreakdown
}

const FILE_HEADER_GIT = /^diff --git a\/(.+?) b\/(.+)$/
const FILE_HEADER_SVN = /^Index:\s+(.+)$/

/**
 * Run a diff command (`git diff …` / `svn diff …`) and read its stdout as a
 * **stream**, so an arbitrarily large diff never overflows a fixed `execFile`
 * `maxBuffer`. In a single pass it computes exact stats, keeps a bounded raw
 * slice for display, and builds a denoised source/test sample + file breakdown
 * for the AI summary.
 *
 * `args` must be the complete argument list (the caller adds `--non-interactive`
 * for svn, `-C <dir>` for git, etc.).
 */
export function streamDiff(
  bin: string,
  args: string[],
  options: number | Partial<StreamDiffOptions> = {}
): Promise<StreamedDiff> {
  // Back-compat: a bare number is the display budget.
  const opts: StreamDiffOptions =
    typeof options === 'number'
      ? { ...DEFAULT_STREAM_OPTIONS, displayBudget: options }
      : { ...DEFAULT_STREAM_OPTIONS, ...options }

  return new Promise<StreamedDiff>((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true })
    const acc = createDiffStatsAccumulator()

    const kept: string[] = []
    let keptLen = 0
    let truncated = false

    // Denoised sample state.
    const sample: string[] = []
    let sampleLen = 0
    let sampleTruncated = false
    let curCat: FileCategory = 'other'
    let curFile: string | null = null
    let curFileLen = 0
    let curHeaderPushed = false

    // Breakdown state.
    const cat = { source: 0, test: 0, config: 0, generated: 0, other: 0 }
    const dirCounts = new Map<string, number>()
    const seenFiles = new Set<string>()

    let stderr = ''

    const startFile = (rawPath: string): void => {
      const path = rawPath.trim()
      curFile = path
      curCat = classifyDiffPath(path)
      curFileLen = 0
      curHeaderPushed = false
      if (!seenFiles.has(path)) {
        seenFiles.add(path)
        cat[curCat]++
        const d = dirBucket(path)
        dirCounts.set(d, (dirCounts.get(d) ?? 0) + 1)
      }
    }

    const isContentLine = (line: string): boolean =>
      line.startsWith('@@') ||
      (line.startsWith('+') && !line.startsWith('+++')) ||
      (line.startsWith('-') && !line.startsWith('---')) ||
      line.startsWith(' ')

    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity })

    rl.on('line', (line) => {
      const gh = FILE_HEADER_GIT.exec(line)
      const sh = gh ? null : FILE_HEADER_SVN.exec(line)
      if (gh || sh) startFile(gh ? gh[2]! : sh![1]!)

      acc.push(line) // exact stats over the whole stream

      // Bounded raw display slice.
      if (!truncated) {
        if (keptLen + line.length + 1 > opts.displayBudget) truncated = true
        else {
          kept.push(line)
          keptLen += line.length + 1
        }
      }

      // Denoised source/test sample (content lines only, per-file capped).
      if (
        !sampleTruncated &&
        curFile &&
        includeInSample(curCat) &&
        isContentLine(line) &&
        curFileLen < opts.perFileBudget
      ) {
        if (!curHeaderPushed) {
          const header = `\n### ${curFile}\n`
          if (sampleLen + header.length > opts.sampleBudget) {
            sampleTruncated = true
          } else {
            sample.push(header)
            sampleLen += header.length
            curHeaderPushed = true
          }
        }
        if (!sampleTruncated) {
          if (sampleLen + line.length + 1 > opts.sampleBudget) {
            sampleTruncated = true
          } else {
            sample.push(line)
            sampleLen += line.length + 1
            curFileLen += line.length + 1
          }
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
      const topDirs = [...dirCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([dir, files]) => ({ dir, files }))
      resolve({
        diff: kept.join('\n'),
        truncated,
        stats: acc.result(),
        sourceSample: sample.join('\n'),
        sourceSampleTruncated: sampleTruncated,
        breakdown: { ...cat, topDirs }
      })
    })
  })
}
