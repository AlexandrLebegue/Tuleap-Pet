import * as React from 'react'
import { useEffect, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'
import type { MilestoneSummary } from '@shared/types'

type Proposal = {
  velocityAvg: number
  velocityHistory: Array<{ milestoneId: number; label: string; itemsClosed: number }>
  proposedItems: Array<{ id: number; title: string; reason: string; risk: 'low' | 'medium' | 'high' }>
  rationaleMarkdown: string
}

export default function SprintPlanning(): React.JSX.Element {
  const [sprints, setSprints] = useState<MilestoneSummary[]>([])
  const [milestoneId, setMilestoneId] = useState<number | null>(null)
  const [absences, setAbsences] = useState('')
  const [capacity, setCapacity] = useState('1')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const list = await window.api.sprintBoard.listOpenSprints()
      setSprints(list)
      if (list.length > 0 && milestoneId === null) setMilestoneId(list[0]!.id)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header>
        <h1 className="text-xl font-semibold">Sprint Planning Assistant</h1>
        <p className="text-sm text-muted-foreground">
          Propose une composition de sprint à partir du backlog, de la vélocité historique et des absences déclarées.
        </p>
      </header>

      <Card className="grid grid-cols-2 gap-3 p-4">
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
          <Input value={capacity} onChange={(e) => setCapacity(e.target.value)} type="number" step="0.1" min="0.1" max="2" />
        </div>
        <div className="col-span-2">
          <Label>Absences / contraintes du sprint</Label>
          <Input value={absences} onChange={(e) => setAbsences(e.target.value)} placeholder="ex: Alice off lundi, Bob -50% mardi" />
        </div>
        <div className="col-span-2">
          <Button onClick={propose} disabled={busy || !milestoneId}>
            {busy ? 'Analyse…' : 'Proposer une composition'}
          </Button>
        </div>
      </Card>

      {error && <Card className="border-destructive p-3 text-sm text-destructive">{error}</Card>}

      {proposal && (
        <>
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
            <h2 className="mb-2 text-sm font-semibold">Items proposés ({proposal.proposedItems.length})</h2>
            <ul className="space-y-2">
              {proposal.proposedItems.map((it) => (
                <li key={it.id} className="rounded border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <code className="text-xs">#{it.id}</code>
                    <span className="font-medium">{it.title}</span>
                    <Badge
                      variant={it.risk === 'high' ? 'destructive' : it.risk === 'medium' ? 'secondary' : 'outline'}
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
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">{proposal.rationaleMarkdown}</p>
          </Card>
        </>
      )}
    </div>
  )
}
