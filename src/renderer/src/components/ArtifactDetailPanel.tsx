import * as React from 'react'
import type { ArtifactDetail } from '@shared/types'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { X } from 'lucide-react'

type Props = {
  detail: ArtifactDetail | null
  loading: boolean
  error: string | null
  onClose: () => void
}

function ArtifactDetailPanel({ detail, loading, error, onClose }: Props): React.JSX.Element {
  return (
    <aside className="flex h-full w-[420px] shrink-0 flex-col border-l border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">Détail de l&apos;artéfact</h3>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto px-4 py-4">
        {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
            {error}
          </div>
        )}
        {!loading && !error && !detail && (
          <p className="text-sm text-muted-foreground">Sélectionnez un artéfact dans la liste.</p>
        )}
        {detail && (
          <div className="space-y-4">
            <div>
              <p className="font-mono text-xs text-muted-foreground">#{detail.id}</p>
              <h4 className="mt-1 text-base font-semibold">{detail.title || '(sans titre)'}</h4>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {detail.status && <Badge variant="outline">{detail.status}</Badge>}
                {detail.submittedBy && <span>par {detail.submittedBy}</span>}
                {detail.submittedOn && <span>le {new Date(detail.submittedOn).toLocaleDateString()}</span>}
              </div>
            </div>

            {detail.description && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Description
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{detail.description}</p>
              </div>
            )}

            {detail.links.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Liens ({detail.links.length})
                </p>
                <ul className="mt-2 space-y-1">
                  {detail.links.map((link, i) => (
                    <li
                      key={`${link.id}-${link.direction}-${i}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Badge variant="secondary" className="font-mono">
                        #{link.id}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {link.direction === 'forward' ? '→ enfant' : '← parent'}
                        {link.type ? ` · ${link.type}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.values.length > 0 && (
              <details className="rounded-md border border-border">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Champs bruts ({detail.values.length})
                </summary>
                <div className="border-t border-border p-3">
                  <ul className="space-y-2 text-xs">
                    {detail.values.map((v) => (
                      <li key={v.fieldId}>
                        <span className="font-medium">{v.label || `field_${v.fieldId}`}</span>
                        <span className="ml-2 text-muted-foreground">[{v.type}]</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}

export default ArtifactDetailPanel
