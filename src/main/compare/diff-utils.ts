/**
 * Pure helpers for unified diffs (git `git diff` / svn `svn diff`). No Electron /
 * Node imports, so they are unit-testable in isolation.
 */

export type DiffStats = {
  files: number
  additions: number
  deletions: number
  filesChanged: string[]
}

/**
 * Incremental stats accumulator: feed it one diff line at a time. Used by both
 * {@link parseUnifiedDiffStats} (whole-string) and the streaming diff reader, so
 * the line-classification logic lives in exactly one place.
 */
export function createDiffStatsAccumulator(): {
  push: (line: string) => void
  result: () => DiffStats
} {
  const files: string[] = []
  const seen = new Set<string>()
  let additions = 0
  let deletions = 0

  const addFile = (name: string): void => {
    const f = name.trim()
    if (f && !seen.has(f)) {
      seen.add(f)
      files.push(f)
    }
  }

  return {
    push(line: string): void {
      // git file header: "diff --git a/path b/path"
      const git = /^diff --git a\/(.+?) b\/(.+)$/.exec(line)
      if (git) {
        addFile(git[2]!)
        return
      }
      // svn file header: "Index: path"
      const svn = /^Index:\s+(.+)$/.exec(line)
      if (svn) {
        addFile(svn[1]!)
        return
      }
      // Content lines (but not the +++/--- file markers).
      if (line.startsWith('+') && !line.startsWith('+++')) additions++
      else if (line.startsWith('-') && !line.startsWith('---')) deletions++
    },
    result(): DiffStats {
      return { files: files.length, additions, deletions, filesChanged: files }
    }
  }
}

/**
 * Count files / added / removed lines from a unified diff. Recognises both git
 * (`diff --git a/x b/x`) and svn (`Index: x`) file headers, and ignores the
 * `+++`/`---` hunk file markers when counting added/removed content lines.
 */
export function parseUnifiedDiffStats(diff: string): DiffStats {
  const acc = createDiffStatsAccumulator()
  for (const line of diff.split('\n')) acc.push(line)
  return acc.result()
}

/**
 * Truncate a diff to roughly `maxChars` for sending to the LLM, cutting on a
 * line boundary and appending a marker. Returns the (possibly shorter) text and
 * whether it was truncated.
 */
export function truncateDiff(diff: string, maxChars: number): { text: string; truncated: boolean } {
  if (diff.length <= maxChars) return { text: diff, truncated: false }
  const cut = diff.lastIndexOf('\n', maxChars)
  const end = cut > 0 ? cut : maxChars
  return { text: diff.slice(0, end), truncated: true }
}
