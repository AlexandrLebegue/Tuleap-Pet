import * as React from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { ArtifactSummary } from '@shared/types'

type Props = {
  artifact: ArtifactSummary
  isMoving: boolean
  onClick: () => void
}

export default function KanbanCard({ artifact, isMoving, onClick }: Props): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: artifact.id
  })

  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    opacity: isDragging ? 0.4 : 1,
    cursor: isDragging ? 'grabbing' : 'grab'
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="rounded-md border bg-card p-3 shadow-sm select-none hover:border-primary/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="text-sm font-medium leading-snug cursor-pointer hover:underline flex-1"
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
        >
          {artifact.title || '(sans titre)'}
        </span>
        {isMoving && (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent shrink-0 mt-0.5" />
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-mono">#{artifact.id}</span>
        {artifact.submittedBy && (
          <span className="text-xs text-muted-foreground truncate">{artifact.submittedBy}</span>
        )}
      </div>
    </div>
  )
}
