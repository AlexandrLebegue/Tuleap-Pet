import * as React from 'react'
import { useEffect, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { useSettings } from '@renderer/stores/settings.store'
import { api } from '@renderer/lib/api'
import type {
  GitRepository,
  JenkinsBranchStatus,
  JenkinsFailureAnalysis
} from '@shared/types'

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

type AcItem = {
  ac: string
  coverage: 'covered' | 'partial' | 'missing' | 'unverifiable'
  evidence: string
}

type AcceptanceCriteriaReport = {
  applicable: boolean
  artifactId: number | null
  artifactTitle: string
  items: AcItem[]
  coveredCount: number
  message: string
}

type PrReviewResult =
  | {
      ok: true
      overview?: OverviewReport
      codingRules?: CodingRulesReport
      tests?: TestsReport
      acceptanceCriteria?: AcceptanceCriteriaReport
      commentMarkdown: string
      posted: boolean
      postError?: string
    }
  | { ok: false; error: string }

type Sections = {
  overview: boolean
  codingRules: boolean
  tests: boolean
  acceptanceCriteria: boolean
}

function coverageVariant(c: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (c === 'covered') return 'default'
  if (c === 'partial') return 'secondary'
  if (c === 'missing') return 'destructive'
  return 'outline'
}

function complianceVariant(p: number): 'default' | 'secondary' | 'destructive' {
  if (p >= 75) return 'default'
  if (p >= 50) return 'secondary'
  return 'destructive'
}

export default function PrReviewer(): React.JSX.Element {
  const config = useSettings((s) => s.config)
  const [repos, setRepos] = useState<GitRepository[]>([])
  const [selectedRepo, setSelectedRepo] = useState<GitRepository | null>(null)
  const [prs, setPrs] = useState<PullRequestSummary[]>([])
  const [loadingPrs, setLoadingPrs] = useState(false)
  const [selectedPr, setSelectedPr] = useState<PullRequestSummary | null>(null)

  const [sections, setSections] = useState<Sections>({
    overview: true,
    codingRules: true,
    tests: true,
    acceptanceCriteria: true
  })
  const [artifactIdOverride, setArtifactIdOverride] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<PrReviewResult | null>(null)

  const [jenkinsBranchStatus, setJenkinsBranchStatus] = useState<JenkinsBranchStatus | null>(null)
  const [jenkinsInvestigation, setJenkinsInvestigation] = useState<JenkinsFailureAnalysis | null>(null)
  const [jenkinsInvestigating, setJenkinsInvestigating] = useState(false)
  const [jenkinsInvestError, setJenkinsInvestError] = useState<string | null>(null)

  const jenkinsConfigured = Boolean(config.jenkinsUrl && config.hasJenkinsToken)

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

  useEffect(() => {
    setJenkinsBranchStatus(null)
    setJenkinsInvestigation(null)
    setJenkinsInvestError(null)
    if (!selectedPr || !selectedRepo || !jenkinsConfigured) return
    const jobName = selectedRepo.name
    void api.jenkins
      .getBranchStatus({ jobName, branchName: selectedPr.branchSrc })
      .then(setJenkinsBranchStatus)
      .catch(() => setJenkinsBranchStatus(null))
  }, [selectedPr, selectedRepo, jenkinsConfigured, config.jenkinsRepoMapping])

  function toggle(key: keyof Sections): void {
    setSections((s) => ({ ...s, [key]: !s[key] }))
  }

  async function analyze(): Promise<void> {
    if (!selectedRepo || !selectedPr) return
    setAnalyzing(true)
    setResult(null)
    try {
      const parsedId = artifactIdOverride ? Number.parseInt(artifactIdOverride, 10) : null
      const r = await window.api.prReviewer.analyze({
        prId: selectedPr.id,
        repoId: selectedRepo.id,
        cloneUrl: selectedRepo.cloneUrl,
        branchSrc: selectedPr.branchSrc,
        branchDest: selectedPr.branchDest,
        sections,
        artifactIdHint: parsedId !== null && Number.isFinite(parsedId) ? parsedId : null
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

      {/* Encart 4 — Respect des critères d'acceptation */}
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="sec-ac"
            checked={sections.acceptanceCriteria}
            onChange={() => toggle('acceptanceCriteria')}
          />
          <label htmlFor="sec-ac" className="text-sm font-semibold">
            Respect des critères d&apos;acceptation
          </label>
        </div>
        {sections.acceptanceCriteria && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
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
        )}
        {result && result.ok && sections.acceptanceCriteria && result.acceptanceCriteria ? (
          result.acceptanceCriteria.applicable ? (
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  Artéfact #{result.acceptanceCriteria.artifactId}
                </Badge>
                <Badge
                  variant={
                    result.acceptanceCriteria.coveredCount === result.acceptanceCriteria.items.length
                      ? 'default'
                      : 'secondary'
                  }
                >
                  {result.acceptanceCriteria.coveredCount}/{result.acceptanceCriteria.items.length}{' '}
                  couverts
                </Badge>
                {result.acceptanceCriteria.artifactTitle && (
                  <span className="text-xs text-muted-foreground">
                    {result.acceptanceCriteria.artifactTitle}
                  </span>
                )}
              </div>
              <ul className="space-y-1.5">
                {result.acceptanceCriteria.items.map((it, i) => (
                  <li key={i} className="rounded border p-2">
                    <div className="flex items-start gap-2">
                      <Badge variant={coverageVariant(it.coverage)} className="mt-0.5 shrink-0 text-xs">
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
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{result.acceptanceCriteria.message}</p>
          )
        ) : (
          <p className="text-xs text-muted-foreground">
            Vérifie la couverture des critères d&apos;acceptation du ticket Tuleap lié.{' '}
            {sections.acceptanceCriteria ? '' : '(désactivé)'}
          </p>
        )}
      </Card>

      {/* Encart Jenkins */}
      {jenkinsConfigured && selectedPr && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-semibold">Jenkins — Build de la branche</h2>
            <span className="text-xs text-muted-foreground">{selectedPr.branchSrc}</span>
          </div>
          {!jenkinsBranchStatus && (
            <p className="text-xs text-muted-foreground">Aucun build Jenkins trouvé pour cette branche.</p>
          )}
          {jenkinsBranchStatus && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {jenkinsBranchStatus.building ? (
                  <Badge variant="secondary">En cours</Badge>
                ) : jenkinsBranchStatus.result === 'SUCCESS' ? (
                  <Badge className="bg-green-600 text-white">Succès</Badge>
                ) : jenkinsBranchStatus.result === 'FAILURE' ? (
                  <Badge variant="destructive">Échec</Badge>
                ) : jenkinsBranchStatus.result === 'UNSTABLE' ? (
                  <Badge variant="secondary">Instable</Badge>
                ) : (
                  <Badge variant="outline">—</Badge>
                )}
                {jenkinsBranchStatus.buildNumber && (
                  <span className="text-xs text-muted-foreground">
                    #{jenkinsBranchStatus.buildNumber}
                  </span>
                )}
                {jenkinsBranchStatus.timestamp && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(jenkinsBranchStatus.timestamp).toLocaleString('fr-FR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                )}
                {jenkinsBranchStatus.url && (
                  <a
                    href={jenkinsBranchStatus.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground underline"
                  >
                    Voir →
                  </a>
                )}
              </div>
              {(jenkinsBranchStatus.result === 'FAILURE' || jenkinsBranchStatus.result === 'UNSTABLE') &&
                jenkinsBranchStatus.buildNumber && (
                  <div className="space-y-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={jenkinsInvestigating}
                      onClick={async () => {
                        if (!jenkinsBranchStatus.buildNumber) return
                        const jobName = selectedRepo?.name ?? ''
                        setJenkinsInvestigating(true)
                        setJenkinsInvestError(null)
                        setJenkinsInvestigation(null)
                        try {
                          const r = await api.jenkins.investigateFailure({
                            jobName,
                            buildNumber: jenkinsBranchStatus.buildNumber
                          })
                          if ('ok' in r && r.ok === false) {
                            setJenkinsInvestError(r.error)
                          } else {
                            setJenkinsInvestigation(r as JenkinsFailureAnalysis)
                          }
                        } catch (e) {
                          setJenkinsInvestError(e instanceof Error ? e.message : String(e))
                        } finally {
                          setJenkinsInvestigating(false)
                        }
                      }}
                    >
                      {jenkinsInvestigating ? 'Analyse en cours…' : '🔍 Analyser l\'échec'}
                    </Button>
                    {jenkinsInvestError && (
                      <p className="text-xs text-destructive">{jenkinsInvestError}</p>
                    )}
                    {jenkinsInvestigation && (
                      <div className="rounded-md border p-3 bg-muted/30 space-y-2 text-sm">
                        <p className="font-medium text-xs text-muted-foreground">Analyse IA</p>
                        <p>{jenkinsInvestigation.rootCause}</p>
                        {jenkinsInvestigation.affectedSteps.length > 0 && (
                          <ul className="text-xs list-disc list-inside text-muted-foreground">
                            {jenkinsInvestigation.affectedSteps.map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                        )}
                        <p className="text-xs italic">{jenkinsInvestigation.suggestion}</p>
                      </div>
                    )}
                  </div>
              )}
            </div>
          )}
        </Card>
      )}

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
