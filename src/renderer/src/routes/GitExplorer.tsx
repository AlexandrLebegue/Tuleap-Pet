import * as React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@renderer/lib/api'
import { useSettings } from '@renderer/stores/settings.store'
import { Button } from '@renderer/components/ui/button'
import CommentingOptionsPanel from '@renderer/components/CommentingOptionsPanel'
import type {
  GitRepository,
  GitBranch,
  GitCommit,
  Page,
  CommentingOptions,
  JobType
} from '@shared/types'

const DEFAULT_OPTIONS: CommentingOptions = {
  preserveExisting: true,
  addFileHeader: true,
  detailedComments: true,
  applyCodingRules: false,
  onlyChangedFiles: false,
  useContextPipeline: false,
  forceAll: false,
  contextDepth: 3,
  inlineComments: false,
  testPipelineMode: 'basic',
  testBuildEnabled: true,
  testPreset: 'ci-gcc',
  testMaxRepairs: 3
}

type JobModal = {
  type: JobType
  repo: GitRepository
  branch: string
  options: CommentingOptions
  cloneUrlOverride: string
}

export default function GitExplorer(): React.JSX.Element {
  const config = useSettings((s) => s.config)
  const [repos, setRepos] = useState<GitRepository[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [reposError, setReposError] = useState<string | null>(null)

  const [selectedRepo, setSelectedRepo] = useState<GitRepository | null>(null)
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)

  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const [commitsPage, setCommitsPage] = useState<Page<GitCommit> | null>(null)
  const [commitsOffset, setCommitsOffset] = useState(0)
  const [loadingCommits, setLoadingCommits] = useState(false)

  const [jobModal, setJobModal] = useState<JobModal | null>(null)
  const [starting, setStarting] = useState(false)

  // Release Notes modal
  const [rnModal, setRnModal] = useState<{ repoId: number; cloneUrl: string } | null>(null)
  const [rnTags, setRnTags] = useState<string[]>([])
  const [rnFrom, setRnFrom] = useState('')
  const [rnTo, setRnTo] = useState('')
  const [rnLoading, setRnLoading] = useState(false)
  const [rnResult, setRnResult] = useState<string | null>(null)
  const [rnError, setRnError] = useState<string | null>(null)

  const noTempPath = !config.tempClonePath

  useEffect(() => {
    setLoadingRepos(true)
    setReposError(null)
    api.gitExplorer
      .listRepos()
      .then(setRepos)
      .catch((e: unknown) => setReposError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingRepos(false))
  }, [])

  const selectRepo = useCallback((repo: GitRepository) => {
    setSelectedRepo(repo)
    setSelectedBranch(null)
    setCommitsPage(null)
    setCommitsOffset(0)
    setBranches([])
    setLoadingBranches(true)
    api.gitExplorer
      .listBranches(repo.id)
      .then(setBranches)
      .catch(() => setBranches([]))
      .finally(() => setLoadingBranches(false))
  }, [])

  const selectBranch = useCallback(
    (branch: string, offset = 0) => {
      if (!selectedRepo) return
      setSelectedBranch(branch)
      setCommitsOffset(offset)
      setLoadingCommits(true)
      api.gitExplorer
        .listCommits({ repoId: selectedRepo.id, branchName: branch, offset })
        .then(setCommitsPage)
        .catch(() => setCommitsPage(null))
        .finally(() => setLoadingCommits(false))
    },
    [selectedRepo]
  )

  const openModal = useCallback(
    (type: JobType, branch: string) => {
      if (!selectedRepo) return
      setJobModal({
        type,
        repo: selectedRepo,
        branch,
        options: { ...DEFAULT_OPTIONS },
        cloneUrlOverride: selectedRepo.cloneUrl
      })
    },
    [selectedRepo]
  )

  const openRnModal = useCallback(async () => {
    if (!selectedRepo) return
    setRnModal({ repoId: selectedRepo.id, cloneUrl: selectedRepo.cloneUrl })
    setRnResult(null)
    setRnError(null)
    setRnFrom('')
    setRnTo('')
    setRnLoading(true)
    const tags = await window.api.releaseNotes.listRemoteTags({
      repoId: selectedRepo.id,
      cloneUrl: selectedRepo.cloneUrl
    }).catch(() => [] as string[])
    setRnTags(tags)
    if (tags.length >= 2) { setRnFrom(tags[1]!); setRnTo(tags[0]!) }
    else if (tags.length === 1) { setRnFrom(tags[0]!); setRnTo('HEAD') }
    setRnLoading(false)
  }, [selectedRepo])

  async function generateReleaseNotes(): Promise<void> {
    if (!rnModal || !rnFrom || !rnTo) return
    setRnLoading(true)
    setRnResult(null)
    setRnError(null)
    try {
      const r = await window.api.releaseNotes.generate({
        repoId: rnModal.repoId,
        cloneUrl: rnModal.cloneUrl,
        fromRef: rnFrom,
        toRef: rnTo
      })
      if (r.ok) setRnResult(r.markdown)
      else setRnError(r.error)
    } catch (e) {
      setRnError(e instanceof Error ? e.message : String(e))
    } finally {
      setRnLoading(false)
    }
  }

  const startJobFromModal = useCallback(async () => {
    if (!jobModal) return
    const cloneUrl = jobModal.cloneUrlOverride.trim()
    if (!cloneUrl) return
    setStarting(true)
    try {
      await api.gitExplorer.startJob({
        repoId: jobModal.repo.id,
        repoName: jobModal.repo.name,
        cloneUrl,
        branchName: jobModal.branch,
        type: jobModal.type,
        options: jobModal.options
      })
      setJobModal(null)
    } finally {
      setStarting(false)
    }
  }, [jobModal])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Git Explorer</h1>
        {noTempPath && (
          <p className="mt-1 text-sm text-yellow-600 dark:text-yellow-400">
            Configurez un dossier temporaire dans Réglages pour lancer des jobs.
          </p>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden divide-x">
        {/* Repos */}
        <div className="w-56 flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b">
            Dépôts
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingRepos && (
              <p className="p-3 text-xs text-muted-foreground">Chargement…</p>
            )}
            {reposError && (
              <p className="p-3 text-xs text-destructive">{reposError}</p>
            )}
            {!loadingRepos && !reposError && repos.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">Aucun dépôt.</p>
            )}
            {repos.map((r) => (
              <button
                key={r.id}
                onClick={() => selectRepo(r)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors truncate ${
                  selectedRepo?.id === r.id ? 'bg-muted font-medium' : ''
                }`}
                title={r.description || r.name}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>

        {/* Branches */}
        <div className="w-64 flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b">
            Branches
          </div>
          <div className="flex-1 overflow-y-auto">
            {!selectedRepo && (
              <p className="p-3 text-xs text-muted-foreground">Sélectionnez un dépôt.</p>
            )}
            {selectedRepo && loadingBranches && (
              <p className="p-3 text-xs text-muted-foreground">Chargement…</p>
            )}
            {selectedRepo && !loadingBranches && branches.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">Aucune branche.</p>
            )}
            {branches.map((b) => (
              <div
                key={b.name}
                className={`flex items-center justify-between px-3 py-2 hover:bg-muted transition-colors ${
                  selectedBranch === b.name ? 'bg-muted' : ''
                }`}
              >
                <button
                  onClick={() => selectBranch(b.name, 0)}
                  className="flex-1 text-left text-sm truncate min-w-0 mr-1"
                  title={b.name}
                >
                  {b.name}
                </button>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => openModal('commentateur', b.name)}
                    disabled={noTempPath}
                    className="text-xs px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Lancer le commentateur"
                  >
                    💬
                  </button>
                  <button
                    onClick={() => openModal('test-generator', b.name)}
                    disabled={noTempPath}
                    className="text-xs px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Générer des tests"
                  >
                    🧪
                  </button>
                  <button
                    onClick={() => void openRnModal()}
                    disabled={noTempPath}
                    className="text-xs px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Générer des release notes"
                  >
                    📋
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Commits */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b flex items-center justify-between">
            <span>Commits{selectedBranch ? ` — ${selectedBranch}` : ''}</span>
            {commitsPage && (
              <span className="font-normal normal-case">
                {commitsPage.offset + 1}–{Math.min(commitsPage.offset + commitsPage.limit, commitsPage.total)} / {commitsPage.total}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {!selectedBranch && (
              <p className="p-3 text-xs text-muted-foreground">Sélectionnez une branche.</p>
            )}
            {selectedBranch && loadingCommits && (
              <p className="p-3 text-xs text-muted-foreground">Chargement…</p>
            )}
            {selectedBranch && !loadingCommits && commitsPage && commitsPage.items.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">Aucun commit.</p>
            )}
            {selectedBranch && !loadingCommits && commitsPage && commitsPage.items.length > 0 && (
              <p className="px-3 py-2 text-[11px] text-muted-foreground border-b bg-muted/30">
                L'API REST Tuleap n'expose que le commit de tête de la branche. Pour parcourir l'historique complet, lance un job (Commenter / Tests / etc.) qui clone le repo.
              </p>
            )}
            {commitsPage?.items.map((c) => (
              <div key={c.id} className="px-3 py-2 border-b last:border-0 hover:bg-muted/50">
                <div className="flex items-start gap-2">
                  <code className="text-xs text-muted-foreground font-mono shrink-0 mt-0.5">
                    {c.shortId}
                  </code>
                  <div className="min-w-0">
                    <p className="text-sm truncate">{c.title || '(sans message)'}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.authorName}
                      {c.authoredDate && ` · ${new Date(c.authoredDate).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {commitsPage && commitsPage.total > commitsPage.limit && (
            <div className="border-t px-3 py-2 flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={commitsOffset === 0 || loadingCommits}
                onClick={() => selectBranch(selectedBranch!, Math.max(0, commitsOffset - 30))}
              >
                ← Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={commitsPage.offset + commitsPage.limit >= commitsPage.total || loadingCommits}
                onClick={() => selectBranch(selectedBranch!, commitsOffset + 30)}
              >
                Suivant →
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Release Notes modal */}
      {rnModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-lg border shadow-xl w-full max-w-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold">📋 Release Notes</h2>
            <p className="text-sm text-muted-foreground">
              Le dépôt sera cloné automatiquement dans votre dossier temporaire.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Tag / Ref — depuis
                </label>
                {rnLoading && rnTags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Récupération des tags…</p>
                ) : (
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                    value={rnFrom}
                    onChange={(e) => setRnFrom(e.target.value)}
                  >
                    <option value="">— choisir —</option>
                    {rnTags.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Tag / Ref — jusqu'à
                </label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  value={rnTo}
                  onChange={(e) => setRnTo(e.target.value)}
                >
                  <option value="HEAD">HEAD (branche courante)</option>
                  {rnTags.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            {rnError && <p className="text-sm text-destructive">{rnError}</p>}
            {rnResult && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Résultat</p>
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => navigator.clipboard.writeText(rnResult)}
                  >
                    Copier
                  </button>
                </div>
                <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                  {rnResult}
                </pre>
              </div>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => { setRnModal(null); setRnResult(null); setRnError(null) }} disabled={rnLoading}>
                Fermer
              </Button>
              <Button
                onClick={() => void generateReleaseNotes()}
                disabled={rnLoading || !rnFrom || !rnTo}
              >
                {rnLoading ? 'Génération…' : 'Générer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Job launch modal */}
      {jobModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-lg border shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">
              {jobModal.type === 'commentateur' ? '💬 Lancer le commentateur' : '🧪 Générer des tests'}
            </h2>

            <div className="text-sm space-y-2">
              <div className="flex gap-2 text-muted-foreground">
                <span className="font-medium text-foreground shrink-0">Dépôt:</span>
                <span>{jobModal.repo.name}</span>
              </div>
              <div className="flex gap-2 text-muted-foreground">
                <span className="font-medium text-foreground shrink-0">Branche:</span>
                <span>{jobModal.branch}</span>
              </div>
              <div className="flex gap-2 text-muted-foreground">
                <span className="font-medium text-foreground shrink-0">Dossier temp:</span>
                <code className="text-xs truncate">{config.tempClonePath}</code>
              </div>
            </div>

            {/* Clone URL — editable so user can fix it if auto-resolution failed */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                URL de clonage HTTPS
              </label>
              <input
                type="text"
                value={jobModal.cloneUrlOverride}
                onChange={(e) =>
                  setJobModal((prev) => prev ? { ...prev, cloneUrlOverride: e.target.value } : prev)
                }
                placeholder="https://tuleap.example.com/plugins/git/project/repo.git"
                spellCheck={false}
                className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-xs font-mono shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {!jobModal.cloneUrlOverride.trim() && (
                <p className="text-xs text-destructive">
                  URL introuvable automatiquement — saisissez l'URL HTTPS du dépôt.
                </p>
              )}
            </div>

            {jobModal.type === 'commentateur' ? (
              <CommentingOptionsPanel
                options={jobModal.options}
                onChange={(opts) => setJobModal((prev) => prev ? { ...prev, options: opts } : prev)}
                showOnlyChangedFiles={true}
                showContextPipeline={true}
                projectReady={true}
                compact={true}
              />
            ) : (
              <div className="border rounded-md p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Pipeline de génération
                </p>
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="test-pipeline"
                    checked={jobModal.options.testPipelineMode !== 'advanced'}
                    onChange={() => setJobModal((prev) => prev ? { ...prev, options: { ...prev.options, testPipelineMode: 'basic' } } : prev)}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <div>
                    <div className="text-sm font-medium">Basique</div>
                    <div className="text-xs text-muted-foreground">
                      Un appel LLM par fichier — rapide, sans analyse de call-graph.
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="test-pipeline"
                    checked={jobModal.options.testPipelineMode === 'advanced'}
                    onChange={() => setJobModal((prev) => prev ? { ...prev, options: { ...prev.options, testPipelineMode: 'advanced' } } : prev)}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <div>
                    <div className="text-sm font-medium">Avancée — call-graph contextuel</div>
                    <div className="text-xs text-muted-foreground">
                      Analyse les appelants/appelés (BFS prof. 3) pour chaque fonction avant de générer les tests.
                    </div>
                  </div>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!jobModal.options.onlyChangedFiles}
                    onChange={() => setJobModal((prev) => prev
                      ? { ...prev, options: { ...prev.options, onlyChangedFiles: !prev.options.onlyChangedFiles } }
                      : prev)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-sm">Fichiers modifiés uniquement (dernier commit)</span>
                </label>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setJobModal(null)} disabled={starting}>
                Annuler
              </Button>
              <Button
                onClick={() => void startJobFromModal()}
                disabled={starting || !jobModal.cloneUrlOverride.trim()}
              >
                {starting ? 'Démarrage…' : 'Lancer le job'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
