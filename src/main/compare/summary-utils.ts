/**
 * Pure helpers for the compare AI summary. No Electron / LLM imports → these are
 * unit-testable in isolation (sanitisation, chunking, deterministic fallback).
 */
import type { BranchCompareCommit, DiffFileBreakdown } from '@shared/types'

export type SummaryInput = {
  vcs: 'git' | 'svn'
  base: string
  compare: string
  stats: { files: number; additions: number; deletions: number }
  breakdown: DiffFileBreakdown
  commits: BranchCompareCommit[]
  /** Denoised source/test diff sample (generated files already excluded). */
  sourceSample: string
  sourceSampleTruncated: boolean
}

export const MAX_COMMITS = 80
/** Below this many characters, an LLM answer is treated as empty/unusable. */
export const MIN_USEFUL = 16

/**
 * Strip reasoning artifacts that mid-size local models (notably Qwen3) emit. A
 * frequent failure is the model spending its whole output budget inside a
 * `<think>…</think>` block and returning an empty final answer — which surfaced
 * as "_Résumé IA vide_". We remove think/reasoning blocks and unwrap a
 * whole-response code fence, then trim.
 */
export function sanitizeLlmText(raw: string): string {
  if (!raw) return ''
  let t = raw
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '')
  t = t.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
  // Unclosed reasoning block (model ran out of tokens mid-think).
  t = t.replace(/<think>[\s\S]*$/i, '')
  t = t.replace(/<\/?(think|reasoning)>/gi, '')
  t = t.trim()
  // Unwrap a single fenced block wrapping the whole answer.
  const fence = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/.exec(t)
  if (fence) t = fence[1]!.trim()
  return t
}

export function statsLine(input: SummaryInput): string {
  const s = input.stats
  return `${s.files} fichier(s) modifié(s) (+${s.additions} / -${s.deletions})`
}

export function breakdownLine(b: DiffFileBreakdown): string {
  const parts = [
    b.source ? `${b.source} source` : '',
    b.test ? `${b.test} test` : '',
    b.config ? `${b.config} config` : '',
    b.generated ? `${b.generated} générés/vendored` : '',
    b.other ? `${b.other} autres` : ''
  ].filter(Boolean)
  const dirs = b.topDirs
    .slice(0, 6)
    .map((d) => `${d.dir} (${d.files})`)
    .join(', ')
  return `Répartition : ${parts.join(', ') || 'n/a'}.${dirs ? ` Principaux dossiers : ${dirs}.` : ''}`
}

export function commitsBlock(commits: BranchCompareCommit[]): string {
  if (commits.length === 0) return '_(aucun message de commit isolé)_'
  const shown = commits.slice(0, MAX_COMMITS)
  const extra = commits.length - shown.length
  const list = shown
    .map((c) => `- ${c.title || '(sans message)'}${c.authorName ? ` — ${c.authorName}` : ''}`)
    .join('\n')
  return extra > 0 ? `${list}\n- …et ${extra} de plus` : list
}

/** True when there is genuinely nothing to summarise (no commits, no code, no files). */
export function hasNothingToSummarize(input: SummaryInput): boolean {
  return (
    input.commits.length === 0 && input.sourceSample.trim().length === 0 && input.stats.files === 0
  )
}

/** Split the source sample into chunks on file boundaries (`### path` markers). */
export function chunkSourceSample(sample: string, chunkChars: number, maxChunks: number): string[] {
  if (!sample.trim()) return []
  const blocks = sample.split(/\n(?=### )/g).filter((b) => b.trim())
  const chunks: string[] = []
  let cur = ''
  for (const block of blocks) {
    const piece = block.length > chunkChars ? block.slice(0, chunkChars) : block
    if (cur && cur.length + piece.length > chunkChars) {
      chunks.push(cur)
      cur = piece
    } else {
      cur = cur ? `${cur}\n${piece}` : piece
    }
    if (chunks.length >= maxChunks) break
  }
  if (cur && chunks.length < maxChunks) chunks.push(cur)
  return chunks.slice(0, maxChunks)
}

/**
 * Data-only summary built from stats + breakdown + commits. Always non-empty —
 * guarantees the panel shows something useful even when the LLM is unavailable.
 */
export function heuristicSummary(input: SummaryInput): string {
  if (input.stats.files === 0 && input.commits.length === 0) {
    return '_Aucune différence entre les deux branches._'
  }
  const lines: string[] = [
    '### Résumé automatique',
    '',
    `**${statsLine(input)}**`,
    '',
    breakdownLine(input.breakdown)
  ]
  if (input.commits.length > 0) {
    lines.push('', `#### Commits (${input.commits.length})`, commitsBlock(input.commits))
  }
  lines.push('', '_(Synthèse IA indisponible — résumé généré à partir des métadonnées.)_')
  return lines.join('\n')
}
