import * as React from 'react'
import { useState, useMemo, useRef, useEffect } from 'react'
import type { HeaderEntry, HeaderFunctionEntry } from '@shared/types'

export function fnKey(fn: HeaderFunctionEntry): string {
  return `${fn.implFile}::${fn.name}`
}

type Props = {
  headers: HeaderEntry[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
}

function TriCheckbox({
  state,
  onToggle,
  title
}: {
  state: 'all' | 'some' | 'none'
  onToggle: () => void
  title?: string
}): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some'
  }, [state])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'all'}
      onChange={onToggle}
      onClick={(e) => e.stopPropagation()}
      title={title}
      className="h-4 w-4 accent-primary shrink-0"
    />
  )
}

export default function HeaderFunctionSelector({
  headers,
  selected,
  onChange
}: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const q = query.trim().toLowerCase()

  // Header → visible functions given the current query.
  const view = useMemo(() => {
    return headers
      .map((h) => {
        const headerMatches = h.headerPath.toLowerCase().includes(q)
        const fns =
          q && !headerMatches
            ? h.functions.filter(
                (f) =>
                  f.name.toLowerCase().includes(q) ||
                  f.signature.toLowerCase().includes(q) ||
                  f.implFile.toLowerCase().includes(q)
              )
            : h.functions
        return { header: h, fns }
      })
      .filter(({ header, fns }) => fns.length > 0 || header.headerPath.toLowerCase().includes(q))
  }, [headers, q])

  const allKeys = useMemo(() => headers.flatMap((h) => h.functions.map(fnKey)), [headers])
  const globalState: 'all' | 'some' | 'none' =
    allKeys.length === 0 || allKeys.every((k) => !selected.has(k))
      ? 'none'
      : allKeys.every((k) => selected.has(k))
        ? 'all'
        : 'some'

  function setKeys(keys: string[], on: boolean): void {
    const next = new Set(selected)
    for (const k of keys) {
      if (on) next.add(k)
      else next.delete(k)
    }
    onChange(next)
  }

  function toggleGlobal(): void {
    setKeys(allKeys, globalState !== 'all')
  }

  function headerState(h: HeaderEntry): 'all' | 'some' | 'none' {
    const keys = h.functions.map(fnKey)
    if (keys.every((k) => !selected.has(k))) return 'none'
    if (keys.every((k) => selected.has(k))) return 'all'
    return 'some'
  }

  function toggleHeader(h: HeaderEntry): void {
    const keys = h.functions.map(fnKey)
    setKeys(keys, headerState(h) !== 'all')
  }

  function toggleExpanded(path: string): void {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const selectedCount = allKeys.filter((k) => selected.has(k)).length

  return (
    <div className="flex flex-col gap-2 min-h-0">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un header ou une fonction…"
          spellCheck={false}
          className="flex-1 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <label className="flex items-center gap-2 px-1 py-1 text-sm cursor-pointer select-none border-b">
        <TriCheckbox state={globalState} onToggle={toggleGlobal} title="Tout sélectionner" />
        <span className="font-medium">Tout sélectionner</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {selectedCount} fonction(s) sélectionnée(s)
        </span>
      </label>

      <div className="flex-1 overflow-y-auto min-h-0 max-h-80 -mx-1">
        {view.length === 0 && (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            Aucun header avec des fonctions implémentées trouvé.
          </p>
        )}
        {view.map(({ header, fns }) => {
          const isOpen = expanded.has(header.headerPath) || q.length > 0
          return (
            <div key={header.headerPath} className="border-b last:border-0">
              <div className="flex items-center gap-2 px-1 py-1.5 hover:bg-muted/40">
                <TriCheckbox state={headerState(header)} onToggle={() => toggleHeader(header)} />
                <button
                  onClick={() => toggleExpanded(header.headerPath)}
                  className="flex-1 flex items-center gap-1.5 text-left min-w-0"
                >
                  <span className="text-xs text-muted-foreground w-3 shrink-0">
                    {isOpen ? '▾' : '▸'}
                  </span>
                  <span className="font-mono text-xs truncate" title={header.headerPath}>
                    {header.headerPath}
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground shrink-0">
                    {header.functions.length} fn
                  </span>
                </button>
              </div>
              {isOpen && (
                <div className="pl-7 pr-1 pb-1">
                  {fns.map((f) => {
                    const key = fnKey(f)
                    return (
                      <label
                        key={key}
                        className="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-muted/30 rounded px-1"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(key)}
                          onChange={() => setKeys([key], !selected.has(key))}
                          className="h-3.5 w-3.5 accent-primary shrink-0"
                        />
                        <span className="font-mono text-xs truncate flex-1" title={f.signature}>
                          {f.name}
                        </span>
                        <span
                          className="text-[10px] text-muted-foreground shrink-0 font-mono"
                          title={`${f.implFile}:${f.implLine}`}
                        >
                          {f.inHeader ? 'inline' : `${f.implFile.split('/').pop()}:${f.implLine}`}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
