import * as React from 'react'
import { useState } from 'react'
import type { BranchCompareResult } from '@shared/types'

/** Colourise a unified diff line by its leading character. */
function DiffLine({ line }: { line: string }): React.JSX.Element {
  let cls = 'text-foreground/80'
  if (line.startsWith('+') && !line.startsWith('+++')) cls = 'text-green-600 dark:text-green-400'
  else if (line.startsWith('-') && !line.startsWith('---')) cls = 'text-red-600 dark:text-red-400'
  else if (line.startsWith('@@')) cls = 'text-cyan-600 dark:text-cyan-400'
  else if (
    line.startsWith('diff ') ||
    line.startsWith('Index:') ||
    line.startsWith('+++') ||
    line.startsWith('---')
  )
    cls = 'text-muted-foreground font-medium'
  return <span className={cls}>{line || ' '}</span>
}

/**
 * Renders a branch/path comparison: AI feature summary, stats, the commits that
 * are unique to the compared branch, and the colourised unified diff.
 */
export default function CompareResultView({
  result
}: {
  result: BranchCompareResult
}): React.JSX.Element {
  const [showDiff, setShowDiff] = useState(true)
  const lines = result.diff ? result.diff.split('\n') : []

  return (
    <div className="flex flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{result.base}</code>
        <span className="text-muted-foreground">→</span>
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{result.compare}</code>
        <span className="ml-auto flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{result.stats.files} fichier(s)</span>
          <span className="text-green-600 dark:text-green-400">+{result.stats.additions}</span>
          <span className="text-red-600 dark:text-red-400">−{result.stats.deletions}</span>
        </span>
      </div>

      {/* AI summary */}
      <div className="rounded-md border bg-muted/30 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          ✨ Synthèse IA — nouvelles fonctionnalités
        </p>
        <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
          {result.summary}
        </pre>
      </div>

      {/* Commits unique to compare */}
      {result.commits.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Commits / révisions ({result.commits.length})
          </p>
          <div className="max-h-40 overflow-y-auto rounded-md border divide-y">
            {result.commits.map((c) => (
              <div key={c.id} className="flex items-start gap-2 px-2 py-1.5">
                <code className="shrink-0 font-mono text-xs text-muted-foreground">{c.id}</code>
                <div className="min-w-0">
                  <p className="truncate text-sm">{c.title || '(sans message)'}</p>
                  {c.authorName && <p className="text-xs text-muted-foreground">{c.authorName}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diff */}
      <div className="flex min-h-0 flex-col">
        <button
          className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          onClick={() => setShowDiff((s) => !s)}
        >
          {showDiff ? '▾' : '▸'} Diff{result.diffTruncated ? ' (tronqué)' : ''}
        </button>
        {showDiff &&
          (lines.length > 0 ? (
            <pre className="max-h-80 overflow-auto whitespace-pre rounded bg-muted p-2 text-[11px] font-mono leading-snug">
              {lines.map((l, i) => (
                <div key={i}>
                  <DiffLine line={l} />
                </div>
              ))}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">Aucune différence.</p>
          ))}
      </div>
    </div>
  )
}
