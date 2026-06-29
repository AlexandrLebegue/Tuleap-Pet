import * as React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@renderer/lib/api'
import type { SvnPathEntry } from '@shared/types'

/**
 * Navigable SVN path chooser: breadcrumb + folder list, lets the user drill into
 * sub-branches / sub-folders at any depth and select one. Used by the compare
 * modal so the base and compared paths aren't limited to a flat branch list.
 */
export default function SvnPathPicker({
  repoUrl,
  repoName,
  selectedUrl,
  onSelect,
  highlight = 'primary'
}: {
  /** Repository root URL (no trailing slash). */
  repoUrl: string
  repoName: string
  /** Currently selected path URL (to show the ✓). */
  selectedUrl: string
  /** Called when the user picks a path. label is relative to the repo root. */
  onSelect: (url: string, label: string) => void
  highlight?: 'primary' | 'amber'
}): React.JSX.Element {
  const root = repoUrl.replace(/\/+$/, '')

  // Open near the currently-selected path: navigate to its parent folder.
  const initialStack = (() => {
    if (!selectedUrl.startsWith(root)) return []
    const rel = selectedUrl.slice(root.length).replace(/^\/+|\/+$/g, '')
    if (!rel) return []
    return rel.split('/').slice(0, -1)
  })()

  const [stack, setStack] = useState<string[]>(initialStack)
  const [entries, setEntries] = useState<SvnPathEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const urlOf = useCallback(
    (extra?: string): string => [root, ...stack, ...(extra ? [extra] : [])].join('/'),
    [root, stack]
  )
  const labelOf = (extra?: string): string =>
    [...stack, ...(extra ? [extra] : [])].join('/') || '(racine)'

  useEffect(() => {
    let cancelled = false
    // Syncing the folder listing with the SVN server is what this effect is for;
    // the loading flag it sets is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    api.svnExplorer
      .listPaths({ svnUrl: urlOf() })
      .then((res) => {
        if (cancelled) return
        if (res.ok) setEntries(res.entries.filter((e) => e.kind === 'dir'))
        else {
          setEntries([])
          setError(res.error)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [urlOf])

  const ring = highlight === 'amber' ? 'ring-amber-500' : 'ring-primary'
  const selBg = highlight === 'amber' ? 'bg-amber-500/15' : 'bg-primary/15'

  return (
    <div className="flex flex-col rounded-md border bg-background">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1 text-xs">
        <button
          className="text-primary hover:underline"
          onClick={() => setStack([])}
          title={repoName}
        >
          {repoName}
        </button>
        {stack.map((seg, i) => (
          <React.Fragment key={i}>
            <span className="text-muted-foreground">/</span>
            <button
              className="text-primary hover:underline"
              onClick={() => setStack((s) => s.slice(0, i + 1))}
            >
              {seg}
            </button>
          </React.Fragment>
        ))}
        <button
          className={`ml-auto rounded px-1.5 py-0.5 text-[11px] ${
            selectedUrl === urlOf()
              ? `${selBg} ring-1 ${ring}`
              : 'bg-muted hover:bg-muted-foreground/20'
          }`}
          onClick={() => onSelect(urlOf(), labelOf())}
          title="Comparer en utilisant le dossier courant"
        >
          ✓ ce dossier
        </button>
      </div>

      {/* Folder list */}
      <div className="max-h-44 overflow-y-auto">
        {loading && <p className="p-2 text-xs text-muted-foreground">Chargement…</p>}
        {error && <p className="p-2 text-xs text-destructive">{error}</p>}
        {!loading && !error && entries.length === 0 && (
          <p className="p-2 text-xs text-muted-foreground">Aucun sous-dossier.</p>
        )}
        {entries.map((e) => {
          const url = urlOf(e.name)
          return (
            <div
              key={e.name}
              className={`flex items-center justify-between px-2 py-1 hover:bg-muted ${
                selectedUrl === url ? `${selBg}` : ''
              }`}
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
                onClick={() => setStack((s) => [...s, e.name])}
                title={`Ouvrir ${e.name}`}
              >
                <span className="shrink-0">📁</span>
                <span className="truncate">{e.name}</span>
              </button>
              <button
                className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${
                  selectedUrl === url
                    ? `${selBg} ring-1 ${ring}`
                    : 'bg-muted hover:bg-muted-foreground/20'
                }`}
                onClick={() => onSelect(url, labelOf(e.name))}
                title="Sélectionner ce dossier/branche"
              >
                ✓
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
