import * as React from 'react'
import { useEffect, useRef } from 'react'
import { api } from '@renderer/lib/api'
import { useDebug } from '../stores/debug.store'

const LEVEL_STYLE: Record<string, string> = {
  log: 'text-foreground/70',
  warn: 'text-yellow-400',
  error: 'text-red-400'
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour12: false })
}

export default function DebugConsole(): React.JSX.Element {
  const entries = useDebug((s) => s.entries)
  const expanded = useDebug((s) => s.expanded)
  const addEntry = useDebug((s) => s.addEntry)
  const toggle = useDebug((s) => s.toggle)
  const clear = useDebug((s) => s.clear)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return api.debug.subscribe((entry) => addEntry(entry))
  }, [addEntry])

  useEffect(() => {
    if (expanded && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [entries, expanded])

  const last = entries[entries.length - 1]

  return (
    <div className="flex flex-col border-t border-border bg-[#0d0d0d] font-mono text-xs">
      {/* Header bar — always visible */}
      <div
        className="flex cursor-pointer select-none items-center gap-2 px-3 py-1 hover:bg-white/5"
        onClick={toggle}
      >
        <span className="text-muted-foreground">{expanded ? '▼' : '▲'} Debug</span>
        {!expanded && last && (
          <span className={`truncate ${LEVEL_STYLE[last.level]}`}>
            <span className="mr-2 text-muted-foreground/60">{fmtTime(last.ts)}</span>
            {last.message}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {entries.length > 0 && (
            <span className="text-muted-foreground/60">{entries.length} lignes</span>
          )}
          {expanded && (
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); clear() }}
            >
              Effacer
            </button>
          )}
        </div>
      </div>

      {/* Log list */}
      {expanded && (
        <div className="h-48 overflow-y-auto px-3 py-1">
          {entries.length === 0 ? (
            <p className="text-muted-foreground/50 italic">Aucun log.</p>
          ) : (
            entries.map((e) => (
              <div key={e.id} className={`flex gap-2 leading-5 ${LEVEL_STYLE[e.level]}`}>
                <span className="shrink-0 text-muted-foreground/60">{fmtTime(e.ts)}</span>
                <span className="break-all">{e.message}</span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
