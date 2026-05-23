import * as React from 'react'
import { useEffect, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import type { GitRepository } from '@shared/types'

type PullRequestSummary = {
  id: number
  title: string
  branchSrc: string
  branchDest: string
  status: string
  htmlUrl: string
}

type AcItem = {
  ac: string
  coverage: 'covered' | 'partial' | 'missing' | 'unverifiable'
  evidence: string
}

type AnalysisResult = {
  ok: true
  summaryMarkdown: string
  items: AcItem[]
  testsFound: boolean
  docScore: number
} | { ok: false; error: string }

export default function PrAcReview(): React.JSX.Element {
  const [repos, setRepos] = useState<GitRepository[]>([])
  const [selectedRepo, setSelectedRepo] = useState<GitRepository | null>(null)
  const [prs, setPrs] = useState<PullRequestSummary[]>([])
  const [loadingPrs, setLoadingPrs] = useState(false)
  const [selectedPr, setSelectedPr] = useState<PullRequestSummary | null>(null)

  const [artifactIdOverride, setArtifactIdOverride] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)

  useEffect(() => {
    window.api.prAc.listRepos().then(setRepos).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedRepo) { setPrs([]); setSelectedPr(null); return }
    setLoadingPrs(true)
    setPrs([])
    setSelectedPr(null)
    setResult(null)
    window.api.prAc.listPrs({ repoId: selectedRepo.id })
      .then((list) => { setPrs(list); if (list.length > 0) setSelectedPr(list[0]!) })
      .catch(() => {})
      .finally(() => setLoadingPrs(false))
  }, [selectedRepo])

  async function analyze(): Promise<void> {
    if (!selectedRepo || !selectedPr) return
    setAnalyzing(true)
    setResult(null)
    try {
      const artifactIdHint = artifactIdOverride ? Number.parseInt(artifactIdOverride, 10) : null
      const r = await window.api.prAc.analyze({
        prId: selectedPr.id,
        repoId: selectedRepo.id,
        cloneUrl: selectedRepo.cloneUrl,
        branchSrc: selectedPr.branchSrc,
        branchDest: selectedPr.branchDest,
        artifactIdHint: Number.isFinite(artifactIdHint) ? artifactIdHint : null
      })
      setResult(r as AnalysisResult)
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setAnalyzing(false)
    }
  }

  const coverageBadge = (c: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (c === 'covered') return 'default'
    if (c === 'partial') return 'secondary'
    if (c === 'missing') return 'destructive'
    return 'outline'
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header>
        <h1 className="text-xl font-semibold">PR ↔ Acceptance Criteria</h1>
        <p className="text-sm text-muted-foreground">
          Sélectionnez un dépôt et une PR — l&apos;outil clone, analyse le diff, vérifie les tests et
          la documentation, puis poste automatiquement un commentaire sur la PR.
        </p>
      </header>

      <Card className="grid grid-cols-2 gap-3 p-4">
        {/* Repo selector */}
        <div>
          <label className="mb-1 block text-sm font-medium">Dépôt Git</label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={selectedRepo?.id ?? ''}
            onChange={(e) => {
              const repo = repos.find((r) => r.id === Number(e.target.value)) ?? null
              setSelectedRepo(repo)
            }}
          >
            <option value="">— choisir un dépôt —</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        {/* PR selector */}
        <div>
          <label className="mb-1 block text-sm font-medium">
            Pull Request {loadingPrs && <span className="text-xs text-muted-foreground">(chargement…)</span>}
          </label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={selectedPr?.id ?? ''}
            onChange={(e) => {
              const pr = prs.find((p) => p.id === Number(e.target.value)) ?? null
              setSelectedPr(pr)
              setResult(null)
            }}
            disabled={prs.length === 0}
          >
            <option value="">— choisir une PR —</option>
            {prs.map((pr) => (
              <option key={pr.id} value={pr.id}>
                #{pr.id} — {pr.title || `${pr.branchSrc} → ${pr.branchDest}`}
              </option>
            ))}
          </select>
          {selectedPr && (
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedPr.branchSrc} → {selectedPr.branchDest}
            </p>
          )}
        </div>

        {/* Optional artifact ID override */}
        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium">
            ID Artéfact Tuleap (optionnel — déduit du nom de branche si absent)
          </label>
          <input
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={artifactIdOverride}
            onChange={(e) => setArtifactIdOverride(e.target.value)}
            placeholder="ex: 1234"
          />
        </div>

        <div className="col-span-2">
          <Button
            onClick={analyze}
            disabled={analyzing || !selectedRepo || !selectedPr}
          >
            {analyzing ? 'Analyse en cours…' : 'Analyser & Commenter la PR'}
          </Button>
        </div>
      </Card>

      {result && !result.ok && (
        <Card className="border-destructive p-3 text-sm text-destructive">{result.error}</Card>
      )}

      {result && result.ok && (
        <div className="flex flex-col gap-3">
          {/* Checks summary */}
          <Card className="flex items-center gap-4 p-3 text-sm">
            <Badge variant={result.testsFound ? 'default' : 'secondary'}>
              {result.testsFound ? '✅ Tests détectés' : '⚠️ Pas de tests'}
            </Badge>
            <Badge variant="outline">📝 Doc {result.docScore}%</Badge>
            <Badge variant="outline">
              {result.items.filter((i) => i.coverage === 'covered').length}/{result.items.length} AC couvertes
            </Badge>
            <span className="ml-auto text-xs text-muted-foreground">Commentaire posté sur la PR</span>
          </Card>

          {/* AC breakdown */}
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Critères d&apos;acceptation</h2>
            <ul className="space-y-2">
              {result.items.map((it, i) => (
                <li key={i} className="rounded border p-2 text-sm">
                  <div className="flex items-start gap-2">
                    <Badge variant={coverageBadge(it.coverage)} className="mt-0.5 shrink-0 text-xs">
                      {it.coverage}
                    </Badge>
                    <div>
                      <p className="font-medium">{it.ac}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{it.evidence}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {/* Markdown */}
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold">Commentaire posté</h2>
            <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
              {result.summaryMarkdown}
            </pre>
          </Card>
        </div>
      )}
    </div>
  )
}
