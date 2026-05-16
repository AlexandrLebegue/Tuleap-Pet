import * as React from 'react'
import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'

type AcItem = { ac: string; coverage: 'covered' | 'partial' | 'missing' | 'unverifiable'; evidence: string }

const COVERAGE_BADGE: Record<AcItem['coverage'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  covered: 'default',
  partial: 'secondary',
  missing: 'destructive',
  unverifiable: 'outline'
}

export default function PrAcReview(): React.JSX.Element {
  const [repoPath, setRepoPath] = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [headBranch, setHeadBranch] = useState('')
  const [artifactHint, setArtifactHint] = useState('')
  const [items, setItems] = useState<AcItem[]>([])
  const [summary, setSummary] = useState('')
  const [artifactId, setArtifactId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [postResult, setPostResult] = useState<string | null>(null)

  async function pickRepo(): Promise<void> {
    const r = await window.api.ticketBranch.chooseRepo()
    if (r.ok) setRepoPath(r.path)
  }

  async function analyze(): Promise<void> {
    setBusy(true)
    setError(null)
    setItems([])
    setSummary('')
    try {
      const idHint = artifactHint ? Number.parseInt(artifactHint, 10) : null
      const r = await window.api.prAc.analyze({
        repoPath,
        baseBranch,
        headBranch,
        artifactIdHint: Number.isFinite(idHint) ? idHint : null
      })
      if (!r.ok) throw new Error(r.error)
      setItems(r.items)
      setSummary(r.summaryMarkdown)
      setArtifactId(r.artifact.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function postComment(): Promise<void> {
    if (!artifactId) return
    setPosting(true)
    try {
      const r = await window.api.prAc.postComment({ artifactId, markdown: summary })
      setPostResult(r.ok ? '✓ Commentaire posté sur Tuleap.' : `Erreur : ${r.error}`)
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header>
        <h1 className="text-xl font-semibold">PR ↔ Acceptance Criteria</h1>
        <p className="text-sm text-muted-foreground">
          Vérifie qu&apos;une PR couvre tous les critères d&apos;acceptation de l&apos;artéfact Tuleap lié.
        </p>
      </header>

      <Card className="grid grid-cols-2 gap-3 p-4">
        <div className="col-span-2">
          <Label>Dépôt local</Label>
          <div className="flex gap-2">
            <Input value={repoPath} onChange={(e) => setRepoPath(e.target.value)} placeholder="/path/to/repo" />
            <Button variant="outline" onClick={pickRepo}>Parcourir…</Button>
          </div>
        </div>
        <div>
          <Label>Branche de base</Label>
          <Input value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} />
        </div>
        <div>
          <Label>Branche de la PR</Label>
          <Input value={headBranch} onChange={(e) => setHeadBranch(e.target.value)} placeholder="feature/1234-…" />
        </div>
        <div>
          <Label>Hint Artifact ID (optionnel)</Label>
          <Input value={artifactHint} onChange={(e) => setArtifactHint(e.target.value)} placeholder="déduit du nom de branche sinon" />
        </div>
        <div className="col-span-2">
          <Button onClick={analyze} disabled={busy || !repoPath || !headBranch}>
            {busy ? 'Analyse…' : 'Analyser la PR'}
          </Button>
        </div>
      </Card>

      {error && <Card className="border-destructive p-3 text-sm text-destructive">{error}</Card>}

      {items.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold">
            Résultat — artéfact #{artifactId}
          </h2>
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className="rounded border p-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant={COVERAGE_BADGE[it.coverage]}>{it.coverage}</Badge>
                  <span className="font-medium">{it.ac}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{it.evidence}</p>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={postComment} disabled={posting || !artifactId}>
              {posting ? 'Envoi…' : 'Poster le résumé sur Tuleap'}
            </Button>
            {postResult && <span className="text-xs text-muted-foreground">{postResult}</span>}
          </div>
        </Card>
      )}
    </div>
  )
}
