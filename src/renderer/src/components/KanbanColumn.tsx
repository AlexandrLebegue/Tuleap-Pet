import * as React from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { ArtifactSummary } from '@shared/types'
import KanbanCard from './KanbanCard'
import { Button } from './ui/button'

type Props = {
  bindValueId: number
  label: string
  artifacts: ArtifactSummary[]
  movingArtifactId: number | null
  onCreateClick: () => void
  onCardClick: (id: number) => void
}

export default function KanbanColumn({
  bindValueId,
  label,
  artifacts,
  movingArtifactId,
  onCreateClick,
  onCardClick
}: Props): React.JSX.Element {
  const { isOver, setNodeRef } = useDroppable({ id: bindValueId })

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30">
      <div className="flex items-center justify-between px-3 py-2.5 border-b">
        <span className="text-sm font-semibold tracking-tight">{label}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {artifacts.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-2 overflow-y-auto p-2 min-h-[4rem] transition-colors ${
          isOver ? 'bg-primary/5 ring-1 ring-inset ring-primary/30 rounded-b-lg' : ''
        }`}
      >
        {artifacts.map((a) => (
          <KanbanCard
            key={a.id}
            artifact={a}
            isMoving={movingArtifactId === a.id}
            onClick={() => onCardClick(a.id)}
          />
        ))}
      </div>

      <div className="px-2 py-1.5 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground text-xs"
          onClick={onCreateClick}
        >
          + Nouvel artéfact
        </Button>
      </div>
    </div>
  )
}
