import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import type { ArtifactSummary, MilestoneSummary } from '@shared/types'

type Risk = { id: number; level: 'low' | 'medium' | 'high'; reason: string }
type Tab = 'board' | 'planning'

// ── Planning panel types ────────────────────────────────────────────────────

type Proposal = {
  velocityAvg: number
  velocityHistory: Array<{ milestoneId: number; label: string; itemsClosed: number }>
  proposedItems: Array<{ id: number; title: string; reason: string; risk: 'low' | 'medium' | 'high' }>
  rationaleMarkdown: string
}

// ── Main component ──────────────────────────────────────────────────────────

export default function SprintBoard(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('board')
  const [sprints, setSprints] = useState<MilestoneSummary[]>([])
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null)

  // Board state
  const [sprintItems, setSprintItems] = useState<ArtifactSummary[]>([])
  const [backlogItems, setBacklogItems] = useState<ArtifactSummary[]>([])
  const [workflow, setWorkflow] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [risks, setRisks] = useState<Risk[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanDone, setScanDone] = useState(false)
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
    setRisks([])
    setScanDone(false)
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
    setScanDone(false)
    try {
      const result = await window.api.sprintBoard.scanRisks({ items: sprintItems })
      if (result.ok) {
        setRisks(result.risks)
        setScanDone(true)
      }
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

  function handleMove(item: ArtifactSummary, targetStatus: string): void {
    setSprintItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: targetStatus } : i))
    )
  }

  return (
    <div className="flex h-full flex-col gap-0 overflow-hidden">
      {/* Header with sprint selector and tab switcher */}
      <header className="flex flex-wrap items-center gap-3 border-b px-6 py-3">
        <h1 className="text-xl font-semibold">Sprint</h1>
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
          <Badge variant="outline">Fin : {currentSprint.endDate.slice(0, 10)}</Badge>
        )}

        {/* Tab switcher */}
        <div className="ml-auto flex items-center gap-1 rounded-lg border bg-muted p-1">
          <button
            onClick={() => setTab('board')}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              tab === 'board' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Board
          </button>
          <button
            onClick={() => setTab('planning')}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              tab === 'planning' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Planning IA
          </button>
        </div>

        {tab === 'board' && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => selectedSprintId && loadBoard(selectedSprintId)}
              disabled={loading}
            >
              Rafraîchir
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={scanRisks}
              disabled={scanning || sprintItems.length === 0}
            >
              {scanning ? 'Analyse…' : 'Scanner les risques'}
            </Button>
            {scanDone && !scanning && (
              <span className="text-xs text-muted-foreground">
                {risks.length === 0 ? 'Aucun risque détecté' : `${risks.length} risque${risks.length > 1 ? 's' : ''} détecté${risks.length > 1 ? 's' : ''}`}
              </span>
            )}
          </div>
        )}
      </header>

      {error && <div className="px-6 pt-3"><Card className="border-destructive p-3 text-sm text-destructive">{error}</Card></div>}

      {tab === 'board' ? (
        <BoardPanel
          backlogItems={backlogItems}
          workflow={workflow}
          loading={loading}
          itemsByColumn={itemsByColumn}
          riskById={riskById}
          onMove={handleMove}
        />
      ) : (
        <PlanningPanel selectedSprintId={selectedSprintId} sprints={sprints} />
      )}
    </div>
  )
}

// ── Board panel ─────────────────────────────────────────────────────────────

function BoardPanel({
  backlogItems,
  workflow,
  loading,
  itemsByColumn,
  riskById,
  onMove
}: {
  backlogItems: ArtifactSummary[]
  workflow: string[]
  loading: boolean
  itemsByColumn: Map<string, ArtifactSummary[]>
  riskById: Map<number, Risk>
  onMove: (item: ArtifactSummary, targetStatus: string) => void
}): React.JSX.Element {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Chargement…
      </div>
    )
  }

  return (
    <div className="grid flex-1 grid-cols-[280px_1fr] gap-4 overflow-hidden p-6">
      <Card className="flex flex-col overflow-hidden">
        <div className="border-b px-3 py-2">
          <h2 className="text-sm font-semibold">Backlog ({backlogItems.length})</h2>
          <p className="text-xs text-muted-foreground">Items non assignés au sprint</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {backlogItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun item disponible.</p>
          ) : (
            backlogItems.map((item) => (
              <KanbanCard key={item.id} item={item} risk={riskById.get(item.id)} workflow={workflow} onMove={onMove} />
            ))
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
              <div className="min-h-0 flex-1 flex flex-col gap-2 overflow-y-auto">
                {list.map((item) => (
                  <KanbanCard key={item.id} item={item} risk={riskById.get(item.id)} workflow={workflow} onMove={onMove} />
                ))}
              </div>
            </div>
          )
        })}
        {workflow.length === 0 && !loading && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Sélectionnez un sprint pour afficher le board.
          </div>
        )}
      </div>
    </div>
  )
}

function KanbanCard({
  item,
  risk,
  workflow,
  onMove
}: {
  item: ArtifactSummary
  risk?: Risk
  workflow: string[]
  onMove: (item: ArtifactSummary, targetStatus: string) => void
}): React.JSX.Element {
  const navigate = useNavigate()
  const [moving, setMoving] = useState(false)

  async function handleMove(targetStatus: string): Promise<void> {
    if (!targetStatus || targetStatus === item.status || !item.trackerId) return
    setMoving(true)
    try {
      const result = await window.api.sprintBoard.moveItem({
        artifactId: item.id,
        trackerId: item.trackerId,
        targetStatus
      })
      if (result.ok) onMove(item, targetStatus)
    } finally {
      setMoving(false)
    }
  }

  return (
    <Card className="p-2 text-xs hover:shadow-sm" title={item.title}>
      <div className="flex items-start justify-between gap-1">
        <span className="font-medium leading-tight">{item.title || `#${item.id}`}</span>
        <div className="flex shrink-0 items-center gap-1">
          {risk && (
            <Badge
              variant={risk.level === 'high' ? 'destructive' : 'secondary'}
              title={risk.reason}
            >
              ⚠
            </Badge>
          )}
          <button
            title="Démarrer le dev → créer une branche"
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => navigate(`/ticket-branch?artifactId=${item.id}`)}
          >
            🚀
          </button>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2 text-muted-foreground">
        <span>#{item.id}</span>
        {item.submittedBy && <span className="truncate">{item.submittedBy}</span>}
      </div>
      {workflow.length > 1 && (
        <select
          disabled={moving || !item.trackerId}
          value={item.status ?? ''}
          onChange={(e) => handleMove(e.target.value)}
          className="mt-1 w-full rounded border border-input bg-background px-1 py-0.5 text-[10px] text-muted-foreground disabled:opacity-50"
          title="Déplacer vers…"
        >
          <option value="">— déplacer —</option>
          {workflow.map((col) => (
            <option key={col} value={col}>{col}</option>
          ))}
        </select>
      )}
    </Card>
  )
}

// ── Planning panel ──────────────────────────────────────────────────────────

function PlanningPanel({
  selectedSprintId,
  sprints
}: {
  selectedSprintId: number | null
  sprints: MilestoneSummary[]
}): React.JSX.Element {
  const [milestoneId, setMilestoneId] = useState<number | null>(selectedSprintId)
  const [absences, setAbsences] = useState('')
  const [capacity, setCapacity] = useState('1')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync with sprint selector when user changes sprint in header
  useEffect(() => {
    setMilestoneId(selectedSprintId)
  }, [selectedSprintId])

  async function propose(): Promise<void> {
    if (!milestoneId) return
    setBusy(true)
    setError(null)
    try {
      const r = await window.api.sprintPlanning.propose({
        milestoneId,
        absencesNote: absences,
        capacityFactor: Number.parseFloat(capacity) || 1
      })
      if (!r.ok) throw new Error(r.error)
      setProposal({
        velocityAvg: r.velocityAvg,
        velocityHistory: r.velocityHistory,
        proposedItems: r.proposedItems,
        rationaleMarkdown: r.rationaleMarkdown
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">
          Propose une composition de sprint à partir du backlog, de la vélocité historique et des absences déclarées.
        </p>
      </div>

      <Card className="mb-4 grid grid-cols-2 gap-3 p-4">
        <div>
          <Label>Sprint cible</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={milestoneId ?? ''}
            onChange={(e) => setMilestoneId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">—</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Facteur de capacité (1.0 = nominal)</Label>
          <Input
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            type="number"
            step="0.1"
            min="0.1"
            max="2"
          />
        </div>
        <div className="col-span-2">
          <Label>Absences / contraintes du sprint</Label>
          <Input
            value={absences}
            onChange={(e) => setAbsences(e.target.value)}
            placeholder="ex: Alice off lundi, Bob -50% mardi"
          />
        </div>
        <div className="col-span-2">
          <Button onClick={propose} disabled={busy || !milestoneId}>
            {busy ? 'Analyse…' : 'Proposer une composition'}
          </Button>
        </div>
      </Card>

      {error && <Card className="mb-4 border-destructive p-3 text-sm text-destructive">{error}</Card>}

      {proposal && (
        <div className="flex flex-col gap-4">
          <Card className="p-4 text-sm">
            <h2 className="mb-2 font-semibold">Vélocité historique</h2>
            <p className="text-xs text-muted-foreground">
              Moyenne : <strong>{proposal.velocityAvg}</strong> items / sprint
            </p>
            <ul className="mt-2 grid grid-cols-3 gap-1 text-xs">
              {proposal.velocityHistory.map((h) => (
                <li key={h.milestoneId} className="rounded bg-muted px-2 py-1">
                  {h.label} : {h.itemsClosed}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold">
              Items proposés ({proposal.proposedItems.length})
            </h2>
            <ul className="space-y-2">
              {proposal.proposedItems.map((it) => (
                <li key={it.id} className="rounded border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <code className="text-xs">#{it.id}</code>
                    <span className="font-medium">{it.title}</span>
                    <Badge
                      variant={
                        it.risk === 'high'
                          ? 'destructive'
                          : it.risk === 'medium'
                            ? 'secondary'
                            : 'outline'
                      }
                      className="ml-auto"
                    >
                      {it.risk}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{it.reason}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4 text-sm">
            <h2 className="mb-2 font-semibold">Rationale</h2>
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">
              {proposal.rationaleMarkdown}
            </p>
          </Card>
        </div>
      )}
    </div>
  )
}
