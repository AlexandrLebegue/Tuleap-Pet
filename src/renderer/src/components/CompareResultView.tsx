import * as React from 'react'
import { useState } from 'react'
import { api } from '@renderer/lib/api'
import { Button } from '@renderer/components/ui/button'
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

/** Render inline `**bold**` and `` `code` `` spans safely (no HTML injection). */
function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const re = /\*\*(.+?)\*\*|`(.+?)`/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] != null) out.push(<strong key={k++}>{m[1]}</strong>)
    else
      out.push(
        <code key={k++} className="rounded bg-muted px-1 text-[0.9em]">
          {m[2]}
        </code>
      )
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Minimal, safe Markdown renderer for the AI summary (headings, bullets, quotes). */
function Markdown({ text }: { text: string }): React.JSX.Element {
  const lines = text.split('\n')
  const blocks: React.JSX.Element[] = []
  let list: string[] = []
  const flush = (key: number): void => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${key}`} className="my-1 list-disc space-y-0.5 pl-5">
          {list.map((li, i) => (
            <li key={i}>{inline(li)}</li>
          ))}
        </ul>
      )
      list = []
    }
  }
  lines.forEach((raw, i) => {
    const line = raw.trimEnd()
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      list.push(bullet[1]!)
      return
    }
    flush(i)
    if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^#+/)?.[0].length ?? 1
      const content = line.replace(/^#+\s/, '')
      const cls =
        level <= 2
          ? 'mt-2 mb-1 text-sm font-semibold'
          : 'mt-1.5 mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'
      blocks.push(
        <p key={`h-${i}`} className={cls}>
          {inline(content)}
        </p>
      )
    } else if (/^>\s?/.test(line)) {
      blocks.push(
        <p
          key={`q-${i}`}
          className="border-l-2 border-yellow-500/50 pl-2 text-xs text-muted-foreground"
        >
          {inline(line.replace(/^>\s?/, ''))}
        </p>
      )
    } else if (line.trim() === '') {
      // skip blank lines (spacing handled by margins)
    } else {
      blocks.push(
        <p key={`p-${i}`} className="text-sm leading-relaxed">
          {inline(line)}
        </p>
      )
    }
  })
  flush(lines.length)
  return <div>{blocks}</div>
}

function BreakdownChips({ b }: { b: BranchCompareResult['breakdown'] }): React.JSX.Element {
  const chip = (label: string, n: number, cls: string): React.JSX.Element | null =>
    n > 0 ? (
      <span className={`rounded px-1.5 py-0.5 text-[11px] ${cls}`}>
        {n} {label}
      </span>
    ) : null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chip('source', b.source, 'bg-green-500/15 text-green-700 dark:text-green-400')}
      {chip('test', b.test, 'bg-blue-500/15 text-blue-700 dark:text-blue-400')}
      {chip('config', b.config, 'bg-amber-500/15 text-amber-700 dark:text-amber-400')}
      {chip('générés', b.generated, 'bg-muted text-muted-foreground')}
      {chip('autres', b.other, 'bg-muted text-muted-foreground')}
    </div>
  )
}

/**
 * Renders a branch/path comparison: AI feature summary (with an on-demand detailed
 * report), file breakdown, the commits unique to the branch, and the diff.
 */
export default function CompareResultView({
  result,
  vcs
}: {
  result: BranchCompareResult
  vcs: 'git' | 'svn'
}): React.JSX.Element {
  const [showDiff, setShowDiff] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const lines = result.diff ? result.diff.split('\n') : []

  const runDetailed = async (): Promise<void> => {
    setDetailLoading(true)
    setDetailError(null)
    try {
      const res = await api.compare.detailedSummary({
        vcs,
        base: result.base,
        compare: result.compare,
        stats: result.stats,
        breakdown: result.breakdown,
        commits: result.commits,
        sourceSample: result.sourceSample,
        sourceSampleTruncated: result.sourceSampleTruncated
      })
      if (res.ok) setDetail(res.summary)
      else setDetailError(res.error)
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e))
    } finally {
      setDetailLoading(false)
    }
  }

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

      <BreakdownChips b={result.breakdown} />

      {/* Quick AI summary */}
      <div className="rounded-md border bg-muted/30 p-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            ✨ Synthèse rapide
          </p>
          {!detail && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void runDetailed()}
              disabled={detailLoading}
            >
              {detailLoading ? 'Analyse détaillée…' : '🔬 Résumé détaillé'}
            </Button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto">
          <Markdown text={result.summary} />
        </div>
        {detailError && <p className="mt-1 text-xs text-destructive">{detailError}</p>}
      </div>

      {/* Detailed AI summary (on demand) */}
      {detail && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            🔬 Synthèse détaillée
          </p>
          <div className="max-h-96 overflow-y-auto">
            <Markdown text={detail} />
          </div>
        </div>
      )}

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
