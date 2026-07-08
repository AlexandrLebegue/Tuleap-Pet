/**
 * Extract the sprint-artifact ids referenced by a branch name or PR title.
 * Matches every number of the string against the set of known artifact ids,
 * which covers the usual conventions: `tuleap-123`, `art-123`, `story/123`,
 * `feature/123-mon-sujet`, `TASK-123`, `#123`…
 */
export function matchArtifactIds(text: string, knownIds: Set<number>): number[] {
  const out: number[] = []
  const seen = new Set<number>()
  for (const m of text.matchAll(/\d{1,10}/g)) {
    const id = Number.parseInt(m[0], 10)
    if (knownIds.has(id) && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}
