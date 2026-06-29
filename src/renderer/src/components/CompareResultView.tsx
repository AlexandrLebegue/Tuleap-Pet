import * as React from 'react'
import { useState, useEffect, useMemo } from 'react'
import { api } from '@renderer/lib/api'
import { Button } from '@renderer/components/ui/button'
import DiffExplorer from '@renderer/components/DiffExplorer'
import type { BranchCompareResult, SummaryDiagnostics, SummaryAttempt } from '@shared/types'

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

/** One-line human explanation of why the AI summary failed / fell back. */
function diagHint(d: SummaryDiagnostics): string | null {
  if (!d.usedFallback) return null
  const noProvider = d.attempts.find((a) => a.outcome === 'no-provider')
  if (noProvider || !d.provider) {
    return `Aucun fournisseur LLM utilisable : ${noProvider?.detail ?? 'non configuré (voir Réglages)'}.`
  }
  const err = d.attempts.find((a) => a.outcome === 'error')
  if (err) return `Erreur lors de l'appel au modèle : ${err.detail ?? 'inconnue'}.`
  const empty = d.attempts.find((a) => a.outcome === 'empty' || a.outcome === 'too-short')
  if (empty)
    return `Le modèle n'a pas produit de réponse exploitable — ${empty.detail ?? 'réponse vide'}.`
  return 'Synthèse IA indisponible — résumé généré à partir des métadonnées.'
}

function PromptBlock({ label, text }: { label: string; text: string }): React.JSX.Element {
  return (
    <div className="mt-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <button
          className="text-[10px] text-primary hover:underline"
          onClick={() => void navigator.clipboard.writeText(text)}
        >
          Copier
        </button>
      </div>
      <pre className="mt-0.5 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-1.5 text-[10px] leading-snug">
        {text}
      </pre>
    </div>
  )
}

function AttemptRow({ a, index }: { a: SummaryAttempt; index: number }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const hasPrompt = !!(a.system || a.prompt || a.rawResponse)
  return (
    <div className="rounded border bg-background/60 px-1.5 py-1">
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">#{index + 1}</span>
        <span
          className={
            a.outcome === 'ok'
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          }
        >
          {a.phase} · {a.outcome}
        </span>
        {a.finishReason && <span className="text-muted-foreground">· finish={a.finishReason}</span>}
        {(a.rawChars != null || a.cleanChars != null) && (
          <span className="text-muted-foreground">
            · brut={a.rawChars ?? '?'}→net={a.cleanChars ?? '?'} car.
          </span>
        )}
        {hasPrompt && (
          <button
            className="ml-auto text-[10px] text-primary hover:underline"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? '▾ masquer' : '📋 prompt / réponse'}
          </button>
        )}
      </div>
      {a.detail && <p className="text-muted-foreground">{a.detail}</p>}
      {open && (
        <div>
          {a.system && <PromptBlock label="System" text={a.system} />}
          {a.prompt && <PromptBlock label="Prompt envoyé" text={a.prompt} />}
          {a.rawResponse && <PromptBlock label="Réponse brute du modèle" text={a.rawResponse} />}
        </div>
      )}
    </div>
  )
}

function DiagnosticsPanel({ diag }: { diag: SummaryDiagnostics }): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const hint = diagHint(diag)

  return (
    <div className="mt-2 rounded-md border border-muted bg-muted/20 p-2">
      {hint && <p className="text-xs text-yellow-700 dark:text-yellow-400">⚠️ {hint}</p>}
      <button
        className="mt-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? '▾' : '▸'} 🐞 Débug IA — prompt &amp; réponse ({diag.attempts.length} tentative
        {diag.attempts.length > 1 ? 's' : ''})
      </button>
      {open && (
        <div className="mt-1 space-y-1 text-[11px]">
          <p className="text-muted-foreground">
            Fournisseur : <code className="rounded bg-muted px-1">{diag.provider ?? 'aucun'}</code>{' '}
            · Modèle : <code className="rounded bg-muted px-1">{diag.model ?? '—'}</code>
          </p>
          {diag.attempts.length === 0 && (
            <p className="text-muted-foreground">Aucun appel effectué (aucun fournisseur LLM ?).</p>
          )}
          {diag.attempts.map((a, i) => (
            <AttemptRow key={i} a={a} index={i} />
          ))}
        </div>
      )}
    </div>
  )
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
 * report + AI diagnostics), file breakdown, the commits, and the diff.
 */
export default function CompareResultView({
  result,
  vcs
}: {
  result: BranchCompareResult
  vcs: 'git' | 'svn'
}): React.JSX.Element {
  const [quick, setQuick] = useState<string | null>(null)
  const [quickDiag, setQuickDiag] = useState<SummaryDiagnostics | null>(null)
  const [quickLoading, setQuickLoading] = useState(true)
  const [quickError, setQuickError] = useState<string | null>(null)

  const [detail, setDetail] = useState<string | null>(null)
  const [detailDiag, setDetailDiag] = useState<SummaryDiagnostics | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const req = useMemo(
    () => ({
      vcs,
      base: result.base,
      compare: result.compare,
      stats: result.stats,
      breakdown: result.breakdown,
      commits: result.commits,
      sourceSample: result.sourceSample,
      sourceSampleTruncated: result.sourceSampleTruncated
    }),
    [vcs, result]
  )

  // Fetch the quick summary after the diff is shown — it never blocks the diff,
  // and a slow/down LLM only affects this panel (with a clear error + diagnostics).
  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuickLoading(true)
    setQuickError(null)
    setQuick(null)
    setQuickDiag(null)
    api.compare
      .quickSummary(req)
      .then((res) => {
        if (cancelled) return
        if (res.ok) {
          setQuick(res.summary)
          setQuickDiag(res.diagnostics)
        } else setQuickError(res.error)
      })
      .catch((e: unknown) => {
        if (!cancelled) setQuickError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setQuickLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [req])

  const runDetailed = async (): Promise<void> => {
    setDetailLoading(true)
    setDetailError(null)
    try {
      const res = await api.compare.detailedSummary(req)
      if (res.ok) {
        setDetail(res.summary)
        setDetailDiag(res.diagnostics)
      } else setDetailError(res.error)
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e))
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
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

      {/* Quick AI summary (fetched after the diff) */}
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
              disabled={detailLoading || quickLoading}
            >
              {detailLoading ? 'Analyse détaillée…' : '🔬 Résumé détaillé'}
            </Button>
          )}
        </div>
        {quickLoading && (
          <p className="py-2 text-sm text-muted-foreground">Génération de la synthèse IA…</p>
        )}
        {quickError && (
          <p className="text-xs text-destructive">Synthèse IA indisponible : {quickError}</p>
        )}
        {quick && <Markdown text={quick} />}
        {quickDiag && <DiagnosticsPanel diag={quickDiag} />}
        {detailError && <p className="mt-1 text-xs text-destructive">{detailError}</p>}
      </div>

      {/* Detailed AI summary (on demand) */}
      {detail && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            🔬 Synthèse détaillée
          </p>
          <Markdown text={detail} />
          {detailDiag && <DiagnosticsPanel diag={detailDiag} />}
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

      {/* Diff explorer (file tree + per-file diff) */}
      <div className="flex min-h-0 flex-col">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Différences par fichier
        </p>
        <DiffExplorer files={result.files} filesTruncated={result.filesTruncated} />
      </div>
    </div>
  )
}
