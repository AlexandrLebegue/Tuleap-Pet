import * as React from 'react'
import type { TrackerSummary } from '@shared/types'
import { Card, CardContent } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'

type Props = {
  trackers: TrackerSummary[]
  selectedId: number | null
  onSelect: (id: number) => void
}

function TrackerList({ trackers, selectedId, onSelect }: Props): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {trackers.map((t) => {
        const active = t.id === selectedId
        return (
          <button key={t.id} onClick={() => onSelect(t.id)} className="text-left">
            <Card
              className={cn(
                'transition-colors hover:bg-accent/50',
                active && 'ring-2 ring-ring ring-offset-2'
              )}
            >
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={t.label}>
                    {t.label}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{t.itemName || '—'}</p>
                </div>
                <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium tabular-nums">
                  {t.artifactCount === null ? '—' : t.artifactCount}
                </span>
              </CardContent>
            </Card>
          </button>
        )
      })}
    </div>
  )
}

export default TrackerList
