import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import type { ArtifactSummary, MilestoneSummary } from '@shared/types'

type Risk = { id: number; level: 'low' | 'medium' | 'high'; reason: string }

export default function SprintBoard(): React.JSX.Element {
  const [sprints, setSprints] = useState<MilestoneSummary[]>([])
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null)
  const [sprintItems, setSprintItems] = useState<ArtifactSummary[]>([])
  const [backlogItems, setBacklogItems] = useState<ArtifactSummary[]>([])
  const [workflow, setWorkflow] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [risks, setRisks] = useState<Risk[]>([])
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const list = await window.api.sprintBoard.listOpenSprints()
        setSprints(list)
        if (list.length > 0 && selectedSprintId === null) setSelectedSprintId(list[0]!.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedSprintId === null) return
    void loadBoard(selectedSprintId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSprintId])

  async function loadBoard(milestoneId: number): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const board = await window.api.sprintBoard.getBoard({ milestoneId })
      setSprintItems(board.sprintItems)
      setBacklogItems(board.backlogItems)
      setWorkflow(board.workflow)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function scanRisks(): Promise<void> {
    setScanning(true)
    try {
      const result = await window.api.sprintBoard.scanRisks({ items: sprintItems })
      if (result.ok) setRisks(result.risks)
    } finally {
      setScanning(false)
    }
  }

  const itemsByColumn = useMemo(() => {
    const map = new Map<string, ArtifactSummary[]>()
    for (const col of workflow) map.set(col, [])
    for (const item of sprintItems) {
      const col = workflow.find((c) => (item.status ?? '').toLowerCase() === c.toLowerCase())
      if (col) map.get(col)!.push(item)
      else if (workflow.length > 0) map.get(workflow[0]!)!.push(item)
    }
    return map
  }, [sprintItems, workflow])

  const riskById = useMemo(() => new Map(risks.map((r) => [r.id, r])), [risks])
  const currentSprint = sprints.find((s) => s.id === selectedSprintId)

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Sprint Board</h1>
        <select
          value={selectedSprintId ?? ''}
          onChange={(e) => setSelectedSprintId(e.target.value ? Number(e.target.value) : null)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="">— sélectionner un sprint —</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {currentSprint?.endDate && (
          <Badge variant="outline">
            Fin : {currentSprint.endDate.slice(0, 10)}
          </Badge>
        )}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => selectedSprintId && loadBoard(selectedSprintId)} disabled={loading}>
            Rafraîchir
          </Button>
          <Button size="sm" variant="secondary" onClick={scanRisks} disabled={scanning || sprintItems.length === 0}>
            {scanning ? 'Analyse…' : 'Scanner les risques (IA)'}
          </Button>
        </div>
      </header>

      {error && <Card className="border-destructive p-3 text-sm text-destructive">{error}</Card>}

      <div className="grid flex-1 grid-cols-[280px_1fr] gap-4 overflow-hidden">
        <Card className="flex flex-col overflow-hidden">
          <div className="border-b px-3 py-2">
            <h2 className="text-sm font-semibold">Backlog ({backlogItems.length})</h2>
            <p className="text-xs text-muted-foreground">Items non assignés au sprint</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {backlogItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun item disponible.</p>
            ) : (
              backlogItems.map((item) => <KanbanCard key={item.id} item={item} risk={riskById.get(item.id)} />)
            )}
          </div>
        </Card>

        <div className="flex flex-1 gap-3 overflow-x-auto">
          {workflow.map((col) => {
            const list = itemsByColumn.get(col) ?? []
            return (
              <div key={col} className="flex min-w-[240px] flex-col rounded-md border bg-muted/20 p-2">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h3 className="text-xs font-semibold uppercase">{col}</h3>
                  <Badge variant="outline">{list.length}</Badge>
                </div>
                <div className="flex flex-col gap-2 overflow-y-auto">
                  {list.map((item) => (
                    <KanbanCard key={item.id} item={item} risk={riskById.get(item.id)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function KanbanCard({ item, risk }: { item: ArtifactSummary; risk?: Risk }): React.JSX.Element {
  return (
    <Card className="cursor-grab p-2 text-xs hover:shadow-sm" title={item.title}>
      <div className="flex items-start justify-between gap-1">
        <span className="font-medium leading-tight">{item.title || `#${item.id}`}</span>
        {risk && (
          <Badge
            variant={risk.level === 'high' ? 'destructive' : 'secondary'}
            className="ml-1 shrink-0"
            title={risk.reason}
          >
            ⚠
          </Badge>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 text-muted-foreground">
        <span>#{item.id}</span>
        {item.submittedBy && <span className="truncate">{item.submittedBy}</span>}
      </div>
    </Card>
  )
}
