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

type CommitInfo = { hash: string; subject: string; author: string }

type OverviewReport = {
  summary: string
  commitCount: number
  filesChanged: number
  added: number
  removed: number
  newFiles: string[]
  commits: CommitInfo[]
}

type CodingRulesReport = {
  applicable: boolean
  percent: number
  deterministic: {
    docCoverage: number
    typeConvention: number
    commentDensity: number
    overall: number
    functionsTotal: number
    functionsDocumented: number
  }
  llmPercent: number | null
  justification: string
  files: string[]
}

type TestsReport = {
  testsAdded: number
  testFiles: string[]
  needsTests: boolean
  rationale: string
}

type PrReviewResult =
  | {
      ok: true
      overview?: OverviewReport
      codingRules?: CodingRulesReport
      tests?: TestsReport
      commentMarkdown: string
      posted: boolean
      postError?: string
    }
  | { ok: false; error: string }

type Sections = { overview: boolean; codingRules: boolean; tests: boolean }

function complianceVariant(p: number): 'default' | 'secondary' | 'destructive' {
  if (p >= 75) return 'default'
  if (p >= 50) return 'secondary'
  return 'destructive'
}

export default function PrReviewer(): React.JSX.Element {
  const [repos, setRepos] = useState<GitRepository[]>([])
  const [selectedRepo, setSelectedRepo] = useState<GitRepository | null>(null)
  const [prs, setPrs] = useState<PullRequestSummary[]>([])
  const [loadingPrs, setLoadingPrs] = useState(false)
  const [selectedPr, setSelectedPr] = useState<PullRequestSummary | null>(null)

  const [sections, setSections] = useState<Sections>({
    overview: true,
    codingRules: true,
    tests: true
  })
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<PrReviewResult | null>(null)

  useEffect(() => {
    window.api.prReviewer
      .listRepos()
      .then(setRepos)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedRepo) {
      setPrs([])
      setSelectedPr(null)
      return
    }
    setLoadingPrs(true)
    setPrs([])
    setSelectedPr(null)
    setResult(null)
    window.api.prReviewer
      .listPrs({ repoId: selectedRepo.id })
      .then((list) => {
        setPrs(list)
        if (list.length > 0) setSelectedPr(list[0]!)
      })
      .catch(() => {})
      .finally(() => setLoadingPrs(false))
  }, [selectedRepo])

  function toggle(key: keyof Sections): void {
    setSections((s) => ({ ...s, [key]: !s[key] }))
  }

  async function analyze(): Promise<void> {
    if (!selectedRepo || !selectedPr) return
    setAnalyzing(true)
    setResult(null)
    try {
      const r = await window.api.prReviewer.analyze({
        prId: selectedPr.id,
        repoId: selectedRepo.id,
        cloneUrl: selectedRepo.cloneUrl,
        branchSrc: selectedPr.branchSrc,
        branchDest: selectedPr.branchDest,
        sections
      })
      setResult(r as PrReviewResult)
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setAnalyzing(false)
    }
  }

  const anyEnabled = sections.overview || sections.codingRules || sections.tests

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header>
        <h1 className="text-xl font-semibold">Pull Request Reviewer</h1>
        <p className="text-sm text-muted-foreground">
          Sélectionnez un dépôt et une PR, activez les encarts souhaités. L&apos;outil analyse la PR
          et publie automatiquement un commentaire de revue ne contenant que les encarts activés.
        </p>
      </header>

      <Card className="grid grid-cols-2 gap-3 p-4">
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
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Pull Request{' '}
            {loadingPrs && <span className="text-xs text-muted-foreground">(chargement…)</span>}
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

        <div className="col-span-2">
          <Button
            onClick={analyze}
            disabled={analyzing || !selectedRepo || !selectedPr || !anyEnabled}
          >
            {analyzing ? 'Analyse en cours…' : 'Analyser & publier'}
          </Button>
          {!anyEnabled && (
            <span className="ml-3 text-xs text-destructive">Activez au moins un encart.</span>
          )}
        </div>
      </Card>

      {result && !result.ok && (
        <Card className="border-destructive p-3 text-sm text-destructive">{result.error}</Card>
      )}

      {/* Encart 1 — État des lieux */}
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="sec-overview"
            checked={sections.overview}
            onChange={() => toggle('overview')}
          />
          <label htmlFor="sec-overview" className="text-sm font-semibold">
            État des lieux
          </label>
        </div>
        {result && result.ok && sections.overview && result.overview ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{result.overview.commitCount} commit(s)</Badge>
              <Badge variant="outline">{result.overview.filesChanged} fichier(s)</Badge>
              <Badge variant="outline">
                +{result.overview.added} / −{result.overview.removed}
              </Badge>
              {result.overview.newFiles.length > 0 && (
                <Badge variant="secondary">
                  {result.overview.newFiles.length} nouveau(x) fichier(s)
                </Badge>
              )}
            </div>
            <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
              {result.overview.summary}
            </pre>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Résumé des modifications (commits + diff). {sections.overview ? '' : '(désactivé)'}
          </p>
        )}
      </Card>

      {/* Encart 2 — Respect des règles de codage */}
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="sec-rules"
            checked={sections.codingRules}
            onChange={() => toggle('codingRules')}
          />
          <label htmlFor="sec-rules" className="text-sm font-semibold">
            Respect des règles de codage
          </label>
        </div>
        {result && result.ok && sections.codingRules && result.codingRules ? (
          result.codingRules.applicable ? (
            <div className="space-y-2 text-sm">
              <Badge variant={complianceVariant(result.codingRules.percent)}>
                Conformité {result.codingRules.percent}%
              </Badge>
              <ul className="text-xs text-muted-foreground">
                <li>
                  En-têtes documentés : {result.codingRules.deterministic.docCoverage}% (
                  {result.codingRules.deterministic.functionsDocumented}/
                  {result.codingRules.deterministic.functionsTotal})
                </li>
                <li>Conventions de types : {result.codingRules.deterministic.typeConvention}%</li>
                <li>
                  Densité de commentaires : {result.codingRules.deterministic.commentDensity}%
                </li>
                {result.codingRules.llmPercent !== null && (
                  <li>Évaluation conventions (LLM) : {result.codingRules.llmPercent}%</li>
                )}
              </ul>
              <p className="text-xs">{result.codingRules.justification}</p>
              <p className="text-[11px] text-muted-foreground">
                Fichiers évalués : {result.codingRules.files.join(', ')}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Non applicable — aucun nouveau fichier C/C++ dans cette PR.
            </p>
          )
        ) : (
          <p className="text-xs text-muted-foreground">
            % de conformité (nouveaux fichiers C/C++, calcul hybride).{' '}
            {sections.codingRules ? '' : '(désactivé)'}
          </p>
        )}
      </Card>

      {/* Encart 3 — Tests */}
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="sec-tests"
            checked={sections.tests}
            onChange={() => toggle('tests')}
          />
          <label htmlFor="sec-tests" className="text-sm font-semibold">
            Tests
          </label>
        </div>
        {result && result.ok && sections.tests && result.tests ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{result.tests.testsAdded} test(s) ajouté(s)</Badge>
              <Badge variant={result.tests.needsTests ? 'destructive' : 'default'}>
                {result.tests.needsTests ? 'Tests supplémentaires requis' : 'Couverture suffisante'}
              </Badge>
            </div>
            <p className="text-xs">{result.tests.rationale}</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Tests ajoutés et besoin de tests du code ajouté. {sections.tests ? '' : '(désactivé)'}
          </p>
        )}
      </Card>

      {/* Commentaire publié */}
      {result && result.ok && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-semibold">Commentaire publié</h2>
            <Badge variant={result.posted ? 'default' : 'destructive'}>
              {result.posted ? 'Publié sur la PR' : 'Échec de publication'}
            </Badge>
          </div>
          {result.postError && <p className="mb-2 text-xs text-destructive">{result.postError}</p>}
          <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
            {result.commentMarkdown}
          </pre>
        </Card>
      )}
    </div>
  )
}
