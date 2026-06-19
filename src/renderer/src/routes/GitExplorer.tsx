import * as React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@renderer/lib/api'
import { useSettings } from '@renderer/stores/settings.store'
import { Button } from '@renderer/components/ui/button'
import CommentingOptionsPanel from '@renderer/components/CommentingOptionsPanel'
import JobFilePicker from '@renderer/components/JobFilePicker'
import type {
  GitRepository,
  GitBranch,
  GitCommit,
  JenkinsBranchStatus,
  JenkinsBuildResult,
  Page,
  CommentingOptions,
  JobType
} from '@shared/types'

function jenkinsBadge(status: JenkinsBranchStatus | null | undefined): React.JSX.Element | null {
  if (!status) return null
  if (status.building) {
    return <span title="Build en cours" className="text-xs px-1 rounded bg-yellow-100 text-yellow-700">⟳</span>
  }
  const result: JenkinsBuildResult = status.result
  if (result === 'SUCCESS') {
    return <span title="Build OK" className="text-xs px-1 rounded bg-green-100 text-green-700">✓</span>
  }
  if (result === 'FAILURE') {
    return <span title="Build échoué" className="text-xs px-1 rounded bg-red-100 text-red-700">✗</span>
  }
  if (result === 'UNSTABLE') {
    return <span title="Build instable" className="text-xs px-1 rounded bg-yellow-100 text-yellow-700">!</span>
  }
  return null
}

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
  testPipelineMode: 'advanced',
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
  phase: 'preparing' | 'ready' | 'error'
  prepId?: string
  files: string[]
  changedFiles: string[]
  selected: Set<string>
  error?: string
}

export default function GitExplorer(): React.JSX.Element {
  const config = useSettings((s) => s.config)
  const [repos, setRepos] = useState<GitRepository[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [reposError, setReposError] = useState<string | null>(null)

  const [selectedRepo, setSelectedRepo] = useState<GitRepository | null>(null)
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [jenkinsBuildStatuses, setJenkinsBuildStatuses] = useState<
    Record<string, JenkinsBranchStatus | null>
  >({})

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

  useEffect(() => {
    if (!selectedRepo || branches.length === 0) return
    if (!config.jenkinsUrl || !config.hasJenkinsToken) return
    const jobName = selectedRepo.name
    let cancelled = false
    void (async () => {
      const statuses: Record<string, JenkinsBranchStatus | null> = {}
      await Promise.all(
        branches.map(async (b) => {
          try {
            statuses[b.name] = await api.jenkins.getBranchStatus({ jobName, branchName: b.name })
          } catch {
            statuses[b.name] = null
          }
        })
      )
      if (!cancelled) setJenkinsBuildStatuses(statuses)
    })()
    return () => { cancelled = true }
  }, [selectedRepo, branches, config.jenkinsUrl, config.hasJenkinsToken])

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
    setJenkinsBuildStatuses({})
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

  // Clone le dépôt en asynchrone puis remplit la liste de fichiers du sélecteur.
  const prepare = useCallback(
    async (repo: GitRepository, branch: string, cloneUrl: string) => {
      setJobModal((prev) => prev ? { ...prev, phase: 'preparing', error: undefined } : prev)
      try {
        const { prepId, files, changedFiles } = await api.gitExplorer.prepareJob({
          repoName: repo.name,
          cloneUrl: cloneUrl.trim(),
          branchName: branch
        })
        setJobModal((prev) =>
          prev
            ? {
                ...prev,
                phase: 'ready',
                prepId,
                files,
                changedFiles,
                // Pré-sélection : tous les fichiers source.
                selected: new Set(files)
              }
            : prev
        )
      } catch (e) {
        setJobModal((prev) =>
          prev ? { ...prev, phase: 'error', error: e instanceof Error ? e.message : String(e) } : prev
        )
      }
    },
    []
  )

  const openModal = useCallback(
    (type: JobType, branch: string) => {
      if (!selectedRepo) return
      setJobModal({
        type,
        repo: selectedRepo,
        branch,
        options: { ...DEFAULT_OPTIONS },
        cloneUrlOverride: selectedRepo.cloneUrl,
        phase: 'preparing',
        files: [],
        changedFiles: [],
        selected: new Set()
      })
      void prepare(selectedRepo, branch, selectedRepo.cloneUrl)
    },
    [selectedRepo, prepare]
  )

  const closeJobModal = useCallback(() => {
    setJobModal((prev) => {
      if (prev?.prepId) void api.gitExplorer.discardPrepared(prev.prepId)
      return null
    })
  }, [])

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
    if (!cloneUrl || jobModal.phase !== 'ready' || jobModal.selected.size === 0) return
    setStarting(true)
    try {
      await api.gitExplorer.startJob({
        repoId: jobModal.repo.id,
        repoName: jobModal.repo.name,
        cloneUrl,
        branchName: jobModal.branch,
        type: jobModal.type,
        options: jobModal.options,
        prepId: jobModal.prepId,
        selectedFiles: [...jobModal.selected]
      })
      // Le job réutilise le clone préparé : ne pas le supprimer ici.
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
                  className="flex-1 text-left text-sm truncate min-w-0 mr-1 flex items-center gap-1"
                  title={b.name}
                >
                  <span className="truncate">{b.name}</span>
                  {jenkinsBadge(jenkinsBuildStatuses[b.name])}
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
          <div className="bg-card rounded-lg border shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
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
            </div>

            {/* Phase 1 — clone en cours */}
            {jobModal.phase === 'preparing' && (
              <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                <span className="inline-block size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Clonage du dépôt en cours…
              </div>
            )}

            {/* Phase erreur — URL éditable + réessayer */}
            {jobModal.phase === 'error' && (
              <div className="space-y-2">
                <p className="text-sm text-destructive">{jobModal.error}</p>
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
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!jobModal.cloneUrlOverride.trim()}
                  onClick={() => void prepare(jobModal.repo, jobModal.branch, jobModal.cloneUrlOverride)}
                >
                  Réessayer le clonage
                </Button>
              </div>
            )}

            {/* Phase 2 — sélection des fichiers + options */}
            {jobModal.phase === 'ready' && (
              <>
                <div>
                  <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Fichiers à {jobModal.type === 'commentateur' ? 'commenter' : 'tester'}
                  </p>
                  <JobFilePicker
                    files={jobModal.files}
                    changedFiles={jobModal.changedFiles}
                    selected={jobModal.selected}
                    onChange={(next) => setJobModal((prev) => prev ? { ...prev, selected: next } : prev)}
                    disabled={starting}
                  />
                </div>

                {jobModal.type === 'commentateur' ? (
                  <CommentingOptionsPanel
                    options={jobModal.options}
                    onChange={(opts) => setJobModal((prev) => prev ? { ...prev, options: opts } : prev)}
                    showOnlyChangedFiles={false}
                    showContextPipeline={true}
                    showCommentScope={true}
                    projectReady={true}
                    compact={true}
                  />
                ) : (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Pipeline avancée (call-graph contextuel) : analyse les appelants/appelés
                    de chaque fonction avant de générer les tests.
                  </div>
                )}
              </>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={closeJobModal} disabled={starting}>
                Annuler
              </Button>
              <Button
                onClick={() => void startJobFromModal()}
                disabled={starting || jobModal.phase !== 'ready' || jobModal.selected.size === 0}
              >
                {starting
                  ? 'Démarrage…'
                  : jobModal.phase === 'ready'
                    ? `Lancer sur ${jobModal.selected.size} fichier(s)`
                    : 'Lancer le job'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
