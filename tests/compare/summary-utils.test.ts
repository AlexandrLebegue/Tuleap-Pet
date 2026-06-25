import { describe, it, expect } from 'vitest'
import {
  sanitizeLlmText,
  heuristicSummary,
  chunkSourceSample,
  hasNothingToSummarize,
  type SummaryInput
} from '../../src/main/compare/summary-utils'
import type { DiffFileBreakdown } from '@shared/types'

const breakdown = (over: Partial<DiffFileBreakdown> = {}): DiffFileBreakdown => ({
  source: 0,
  test: 0,
  config: 0,
  generated: 0,
  other: 0,
  topDirs: [],
  ...over
})

const input = (over: Partial<SummaryInput> = {}): SummaryInput => ({
  vcs: 'svn',
  base: 'trunk',
  compare: 'branches/feat',
  stats: { files: 0, additions: 0, deletions: 0 },
  breakdown: breakdown(),
  commits: [],
  sourceSample: '',
  sourceSampleTruncated: false,
  ...over
})

describe('sanitizeLlmText (Qwen3 <think> robustness)', () => {
  it('strips a closed <think> block and keeps the answer', () => {
    expect(sanitizeLlmText('<think>let me reason…</think>\n## Résultat\n- a')).toBe(
      '## Résultat\n- a'
    )
  })

  it('strips an UNCLOSED <think> (model ran out of tokens) → empty, triggering fallback', () => {
    // This is the exact "_Résumé IA vide_" failure: only a dangling think block.
    expect(sanitizeLlmText('<think>reasoning that never finished because tokens ran out')).toBe('')
  })

  it('unwraps a whole-response markdown fence', () => {
    expect(sanitizeLlmText('```markdown\n## X\n- y\n```')).toBe('## X\n- y')
  })

  it('returns empty for empty/whitespace input', () => {
    expect(sanitizeLlmText('')).toBe('')
    expect(sanitizeLlmText('   \n  ')).toBe('')
  })
})

describe('heuristicSummary (never-empty fallback)', () => {
  it('summarises from commits + breakdown when no source code', () => {
    const out = heuristicSummary(
      input({
        stats: { files: 4924, additions: 16000427, deletions: 8678 },
        breakdown: breakdown({
          source: 12,
          generated: 4900,
          topDirs: [{ dir: 'Visual', files: 4900 }]
        }),
        commits: [
          { id: 'r7935', title: 'Ajout Mode Camera (Target 800x1085)', authorName: 'fnsp943' },
          { id: 'r7318', title: 'sim: update full auto wave', authorName: 'fnsp943' }
        ]
      })
    )
    expect(out).toContain('4924 fichier')
    expect(out).toContain('Ajout Mode Camera')
    expect(out).toContain('générés')
    expect(out.length).toBeGreaterThan(40)
  })

  it('reports no differences when truly empty', () => {
    expect(heuristicSummary(input())).toBe('_Aucune différence entre les deux branches._')
  })
})

describe('hasNothingToSummarize', () => {
  it('is true only when no commits, no code and no files', () => {
    expect(hasNothingToSummarize(input())).toBe(true)
    expect(
      hasNothingToSummarize(input({ commits: [{ id: 'r1', title: 'x', authorName: 'a' }] }))
    ).toBe(false)
    expect(hasNothingToSummarize(input({ stats: { files: 1, additions: 1, deletions: 0 } }))).toBe(
      false
    )
  })
})

describe('chunkSourceSample (map-reduce for large infra)', () => {
  const sample = ['### a.c', '+line1', '+line2', '### b.c', '+line3', '### c.c', '+line4'].join(
    '\n'
  )

  it('splits on file boundaries and respects the chunk budget', () => {
    const chunks = chunkSourceSample(sample, 20, 10)
    expect(chunks.length).toBeGreaterThan(1)
    // every chunk starts at a file boundary
    expect(chunks.every((c) => c.trimStart().startsWith('### '))).toBe(true)
  })

  it('caps the number of chunks (bounds cost on huge diffs)', () => {
    const big = Array.from({ length: 100 }, (_, i) => `### f${i}.c\n+x`).join('\n')
    expect(chunkSourceSample(big, 5, 10).length).toBe(10)
  })

  it('returns [] for an empty sample', () => {
    expect(chunkSourceSample('', 100, 5)).toEqual([])
  })
})
