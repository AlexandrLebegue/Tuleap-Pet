import * as React from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@renderer/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  GitBranch, FolderOpen, Loader2, CheckCircle2, AlertCircle, GitPullRequest, RefreshCw
} from 'lucide-react'

type GitRepository = { id: number; name: string; description: string; cloneUrl: string }
type GitBranchItem = { name: string }

type Options = {
  preserveExisting: boolean
  addFileHeader: boolean
  detailedComments: boolean
  applyCodingRules: boolean
}

const DEFAULT_OPTIONS: Options = {
  preserveExisting: true,
  addFileHeader: true,
  detailedComments: true,
  applyCodingRules: false
}

type ProgressEvent =
  | { type: 'start'; totalFiles: number; estimatedSeconds: number }
  | { type: 'file'; index: number; total: number; filename: string; etaSeconds: number }
  | { type: 'git'; step: 'checkout' | 'branch' | 'add' | 'commit' | 'push' }
  | { type: 'pr'; prId: number }
  | { type: 'done'; filesProcessed: number; skippedFiles: number; branchName: string }
  | { type: 'error'; message: string }

type RunState =
  | { phase: 'idle' }
  | { phase: 'running'; totalFiles: number; currentIndex: number; currentFile: string; etaSeconds: number; gitStep: string }
  | { phase: 'done'; filesProcessed: number; skippedFiles: number; branchName: string; prId: number; prUrl: string }
  | { phase: 'error'; message: string }

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s restantes`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s restantes`
}

const GIT_STEP_LABELS: Record<string, string> = {
  checkout: 'Checkout de la branche…',
  branch: 'Création de la branche AI…',
  add: 'git add…',
  commit: 'git commit…',
  push: 'git push…'
}

export default function CommenterPR(): React.JSX.Element {
  const [repos, setRepos] = useState<GitRepository[]>([])
  const [reposLoading, setReposLoading] = useState(false)
  const [reposError, setReposError] = useState('')
  const [selectedRepo, setSelectedRepo] = useState<GitRepository | null>(null)

  const [branches, setBranches] = useState<GitBranchItem[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState('')

  const [workDir, setWorkDir] = useState('')
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS)
  const [run, setRun] = useState<RunState>({ phase: 'idle' })

  const unsubRef = useRef<(() => void) | null>(null)

  const loadRepos = useCallback(async () => {
    setReposLoading(true)
    setReposError('')
    setRepos([])
    setSelectedRepo(null)
    setBranches([])
    setSelectedBranch('')
    try {
      const list = await api.commenterPr.listRepos()
      setRepos(list)
    } catch (err) {
      setReposError(err instanceof Error ? err.message : String(err))
    } finally {
      setReposLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRepos()
    return () => {
      unsubRef.current?.()
    }
  }, [loadRepos])

  const onRepoChange = async (id: string): Promise<void> => {
    const repo = repos.find((r) => String(r.id) === id) ?? null
    setSelectedRepo(repo)
    setSelectedBranch('')
    setBranches([])
    if (!repo) return
    setBranchesLoading(true)
    try {
      const list = await api.commenterPr.listBranches(repo.id)
      setBranches(list)
    } catch {
      setBranches([])
    } finally {
      setBranchesLoading(false)
    }
  }

  const onChooseDir = async (): Promise<void> => {
    const result = await api.commenterPr.chooseDir()
    if (result.ok && result.path) setWorkDir(result.path)
  }

  const toggleOption = (key: keyof Options): void => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const onStart = async (): Promise<void> => {
    if (!selectedRepo || !selectedBranch || !workDir) return

    unsubRef.current?.()
    setRun({ phase: 'running', totalFiles: 0, currentIndex: 0, currentFile: '', etaSeconds: 0, gitStep: '' })

    const unsub = api.commenterPr.subscribe((event: ProgressEvent) => {
      if (event.type === 'start') {
        setRun((prev) =>
          prev.phase === 'running'
            ? { ...prev, totalFiles: event.totalFiles, etaSeconds: event.estimatedSeconds }
            : prev
        )
      } else if (event.type === 'file') {
        setRun((prev) =>
          prev.phase === 'running'
            ? { ...prev, currentIndex: event.index + 1, currentFile: event.filename, etaSeconds: event.etaSeconds, gitStep: '' }
            : prev
        )
      } else if (event.type === 'git') {
        setRun((prev) =>
          prev.phase === 'running'
            ? { ...prev, gitStep: GIT_STEP_LABELS[event.step] ?? event.step }
            : prev
        )
      } else if (event.type === 'done') {
        setRun({ phase: 'done', filesProcessed: event.filesProcessed, skippedFiles: event.skippedFiles, branchName: event.branchName, prId: 0, prUrl: '' })
      } else if (event.type === 'pr') {
        setRun((prev) =>
          prev.phase === 'done' ? { ...prev, prId: event.prId } : prev
        )
      } else if (event.type === 'error') {
        setRun((s) => {
          if (s.phase === 'done') return s
          return { phase: 'error', message: event.message }
        })
      }
    })
    unsubRef.current = unsub

    try {
      const result = await api.commenterPr.start({
        workDir,
        repoId: selectedRepo.id,
        branch: selectedBranch,
        options: {
          preserveExisting: options.preserveExisting,
          addFileHeader: options.addFileHeader,
          detailedComments: options.detailedComments,
          applyCodingRules: options.applyCodingRules
        } as Parameters<typeof api.commenterPr.start>[0]['options']
      })
      if (result.prUrl) {
        setRun((prev) =>
          prev.phase === 'done' ? { ...prev, prUrl: result.prUrl ?? '', prId: result.prId ?? 0 } : prev
        )
      }
    } catch (err) {
      setRun({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      unsub()
      unsubRef.current = null
    }
  }

  const isRunning = run.phase === 'running'
  const canStart = !!selectedRepo && !!selectedBranch && !!workDir && !isRunning

  const progressPct =
    run.phase === 'running' && run.totalFiles > 0
      ? Math.round((run.currentIndex / run.totalFiles) * 100)
      : 0

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-lg font-semibold">Commentateur PR</h1>
        <p className="text-sm text-muted-foreground">
          Commente tous les fichiers C/C++ d'un dépôt Git, pousse une branche et crée une pull request Tuleap.
        </p>
      </div>

      {/* Step 1 — Repo & Branch */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <GitBranch className="size-4" />
            Dépôt et branche
          </CardTitle>
          <CardDescription className="text-xs">
            Sélectionnez le dépôt Git du projet Tuleap et la branche source.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {reposError && (
            <div className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {reposError}
            </div>
          )}
          <div className="flex gap-2">
            <select
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              value={selectedRepo?.id ?? ''}
              onChange={(e) => onRepoChange(e.target.value)}
              disabled={reposLoading || isRunning}
            >
              <option value="">
                {reposLoading ? 'Chargement…' : repos.length === 0 ? 'Aucun dépôt trouvé' : '— Sélectionner un dépôt —'}
              </option>
              {repos.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={loadRepos}
              disabled={reposLoading || isRunning}
              title="Rafraîchir la liste"
            >
              <RefreshCw className={`size-4 ${reposLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {selectedRepo && (
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              disabled={branchesLoading || isRunning}
            >
              <option value="">
                {branchesLoading ? 'Chargement des branches…' : '— Sélectionner une branche —'}
              </option>
              {branches.map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
          )}
        </CardContent>
      </Card>

      {/* Step 2 — Local working copy */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FolderOpen className="size-4" />
            Copie locale du dépôt
          </CardTitle>
          <CardDescription className="text-xs">
            Pointez vers votre copie de travail locale (le dossier contenant le <code>.git/</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <input
            readOnly
            value={workDir}
            placeholder="Aucun dossier sélectionné"
            className="flex-1 rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
          />
          <Button variant="outline" size="sm" onClick={onChooseDir} disabled={isRunning}>
            Parcourir…
          </Button>
        </CardContent>
      </Card>

      {/* Step 3 — Options */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Options de commentaire</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {([
            ['preserveExisting', 'Préserver les commentaires existants', ''],
            ['addFileHeader', "Ajouter l'en-tête de fichier", ''],
            ['detailedComments', 'Commentaires détaillés', ''],
            ['applyCodingRules', 'Appliquer les règles de codage', 'Renomme les variables et convertit les types. Attention : modifie le code.']
          ] as [keyof Options, string, string][]).map(([key, label, desc]) => (
            <label key={key} className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={options[key]}
                onChange={() => toggleOption(key)}
                disabled={isRunning}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <div>
                <span className={`text-sm ${key === 'applyCodingRules' ? 'text-orange-600 dark:text-orange-400 font-medium' : ''}`}>
                  {label}
                </span>
                {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
              </div>
            </label>
          ))}
        </CardContent>
      </Card>

      {/* Start button */}
      <Button onClick={onStart} disabled={!canStart} className="w-fit">
        {isRunning
          ? <><Loader2 className="mr-2 size-4 animate-spin" />Traitement en cours…</>
          : <><GitPullRequest className="mr-2 size-4" />Commenter et créer la PR</>
        }
      </Button>

      {/* Progress */}
      {run.phase === 'running' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Progression
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {run.totalFiles > 0 && (
              <>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Fichier {run.currentIndex}/{run.totalFiles}</span>
                  <span>{formatEta(run.etaSeconds)}</span>
                </div>
                {run.currentFile && (
                  <p className="text-xs font-mono truncate text-muted-foreground">{run.currentFile}</p>
                )}
              </>
            )}
            {run.gitStep && (
              <Badge variant="outline" className="text-xs">{run.gitStep}</Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* Done */}
      {run.phase === 'done' && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="size-4" />
              Terminé avec succès
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{run.filesProcessed} fichier(s) commenté(s){run.skippedFiles > 0 ? `, ${run.skippedFiles} ignoré(s)` : ''}.</p>
            <p>Branche : <code className="font-mono text-xs bg-muted px-1 rounded">{run.branchName}</code></p>
            {run.prUrl && (
              <p>
                Pull request :{' '}
                <a href={run.prUrl} target="_blank" rel="noreferrer" className="text-primary underline text-xs">
                  #{run.prId} — Ouvrir sur Tuleap
                </a>
              </p>
            )}
            {!run.prUrl && run.prId === 0 && (
              <p className="text-muted-foreground text-xs">La PR n'a pas pu être créée automatiquement. Créez-la manuellement depuis la branche <code className="font-mono">{run.branchName}</code>.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {run.phase === 'error' && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" />
              Erreur
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">{run.message}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
