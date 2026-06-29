import { ipcMain } from 'electron'
import { summarizeDetailed } from '../compare/feature-summary'
import type { SummaryInput } from '../compare/feature-summary'
import { audit } from '../store/db'
import { debugError } from '../logger'
import type { DetailedSummaryRequest, SummaryDiagnostics } from '@shared/types'

export function registerCompareHandlers(): void {
  // On-demand detailed (map-reduce) summary. Runs several LLM calls, so it is
  // triggered explicitly from the compare panel rather than on every compare.
  ipcMain.handle(
    'compare:detailed-summary',
    async (
      _event,
      args: unknown
    ): Promise<
      { ok: true; summary: string; diagnostics: SummaryDiagnostics } | { ok: false; error: string }
    > => {
      const req = args as DetailedSummaryRequest
      if (!req || typeof req !== 'object') return { ok: false, error: 'Requête invalide.' }
      const input: SummaryInput = {
        vcs: req.vcs === 'svn' ? 'svn' : 'git',
        base: req.base ?? '',
        compare: req.compare ?? '',
        stats: req.stats ?? { files: 0, additions: 0, deletions: 0 },
        breakdown: req.breakdown ?? {
          source: 0,
          test: 0,
          config: 0,
          generated: 0,
          other: 0,
          topDirs: []
        },
        commits: Array.isArray(req.commits) ? req.commits : [],
        sourceSample: typeof req.sourceSample === 'string' ? req.sourceSample : '',
        sourceSampleTruncated: !!req.sourceSampleTruncated
      }
      audit('compare.detailed-summary', `${input.base}→${input.compare}`, {
        files: input.stats.files
      })
      try {
        const { summary, diagnostics } = await summarizeDetailed(input)
        return { ok: true, summary, diagnostics }
      } catch (err) {
        debugError(
          '[compare] detailed-summary error: %s',
          err instanceof Error ? err.message : String(err)
        )
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
}
