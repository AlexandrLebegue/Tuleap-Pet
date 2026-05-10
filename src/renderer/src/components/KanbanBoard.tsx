import * as React from 'react'
import { useState, useMemo } from 'react'
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { TrackerFields } from '@shared/types'
import { useProject } from '@renderer/stores/project.store'
import KanbanColumn from './KanbanColumn'
import CreateArtifactDialog from './CreateArtifactDialog'

type Props = {
  trackerFields: TrackerFields
  onCardClick: (id: number) => void
}

export default function KanbanBoard({ trackerFields, onCardClick }: Props): React.JSX.Element {
  const allArtifacts = useProject((s) => s.allArtifacts)
  const loadingAllArtifacts = useProject((s) => s.loadingAllArtifacts)
  const allArtifactsError = useProject((s) => s.allArtifactsError)
  const movingArtifactId = useProject((s) => s.movingArtifactId)
  const moveArtifactStatus = useProject((s) => s.moveArtifactStatus)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogStatusId, setDialogStatusId] = useState<number | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const columns = useMemo(() => {
    const bindValues = trackerFields.statusField?.bindValues ?? []
    const knownLabels = new Set(bindValues.map((v) => v.label))

    const grouped: Record<number, typeof allArtifacts> = {}
    for (const bv of bindValues) grouped[bv.id] = []
    const noStatusId = -1
    grouped[noStatusId] = []

    for (const artifact of allArtifacts) {
      const bv = bindValues.find(
        (v) => v.label.toLowerCase() === (artifact.status ?? '').toLowerCase()
      )
      if (bv) {
        ;(grouped[bv.id] ??= []).push(artifact)
      } else if (!knownLabels.has(artifact.status ?? '')) {
        ;(grouped[noStatusId] ??= []).push(artifact)
      }
    }

    return { bindValues, grouped, noStatusId }
  }, [allArtifacts, trackerFields])

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (!over) return
    const artifactId = active.id as number
    const targetBindValueId = over.id as number
    if (targetBindValueId === -1) return
    const artifact = allArtifacts.find((a) => a.id === artifactId)
    if (!artifact) return
    const targetBv = columns.bindValues.find((v) => v.id === targetBindValueId)
    if (!targetBv) return
    if (artifact.status?.toLowerCase() === targetBv.label.toLowerCase()) return
    void moveArtifactStatus(artifactId, targetBindValueId)
  }

  const openCreateDialog = (statusId: number | null): void => {
    setDialogStatusId(statusId)
    setDialogOpen(true)
  }

  if (loadingAllArtifacts && allArtifacts.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Chargement du tableau kanban…
      </div>
    )
  }

  if (allArtifactsError) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
        {allArtifactsError}
      </div>
    )
  }

  const hasNoStatus = (columns.grouped[columns.noStatusId]?.length ?? 0) > 0

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.bindValues.map((bv) => (
            <KanbanColumn
              key={bv.id}
              bindValueId={bv.id}
              label={bv.label}
              artifacts={columns.grouped[bv.id] ?? ([] as typeof allArtifacts)}
              movingArtifactId={movingArtifactId}
              onCreateClick={() => openCreateDialog(bv.id)}
              onCardClick={onCardClick}
            />
          ))}
          {hasNoStatus && (
            <KanbanColumn
              key={-1}
              bindValueId={-1}
              label="Sans statut"
              artifacts={columns.grouped[columns.noStatusId] ?? []}
              movingArtifactId={movingArtifactId}
              onCreateClick={() => openCreateDialog(null)}
              onCardClick={onCardClick}
            />
          )}
          {columns.bindValues.length === 0 && !hasNoStatus && (
            <p className="text-sm text-muted-foreground">
              Ce tracker ne possède pas de champ statut sémantique.
            </p>
          )}
        </div>
      </DndContext>

      {dialogOpen && (
        <CreateArtifactDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          trackerFields={trackerFields}
          defaultStatusBindValueId={dialogStatusId}
        />
      )}
    </>
  )
}
