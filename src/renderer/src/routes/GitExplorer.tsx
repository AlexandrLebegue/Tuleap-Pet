import * as React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@renderer/lib/api'
import { useSettings } from '@renderer/stores/settings.store'
import { Button } from '@renderer/components/ui/button'
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
  onlyChangedFiles: false
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

            <div className="space-y-2 border rounded-md p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Options</p>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={jobModal.options.onlyChangedFiles}
                  onChange={(e) =>
                    setJobModal((prev) =>
                      prev ? { ...prev, options: { ...prev.options, onlyChangedFiles: e.target.checked } } : prev
                    )
                  }
                />
                <span className="text-sm">Fichiers modifiés uniquement (dernier commit)</span>
              </label>
              {jobModal.type === 'commentateur' && (
                <>
                  {(
                    [
                      ['preserveExisting', 'Conserver les commentaires existants'],
                      ['addFileHeader', 'Ajouter un en-tête de fichier'],
                      ['detailedComments', 'Commentaires détaillés'],
                      ['applyCodingRules', 'Appliquer les règles de codage']
                    ] as [keyof CommentingOptions, string][]
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={jobModal.options[key]}
                        onChange={(e) =>
                          setJobModal((prev) =>
                            prev ? { ...prev, options: { ...prev.options, [key]: e.target.checked } } : prev
                          )
                        }
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </>
              )}
            </div>

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
