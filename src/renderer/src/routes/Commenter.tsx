import * as React from 'react'
import { useState, useCallback, useEffect } from 'react'
import { useRef } from 'react'
import { api } from '@renderer/lib/api'
import type { CommenterContextProgress, CommenterContextResult } from '../../../preload'
import type { CommentingOptions, GitRepository, GitBranch } from '@shared/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  Upload, FileCode, CheckCircle2, XCircle, Download, FolderOpen, Loader2,
  Sparkles, SkipForward, GitBranch as GitBranchIcon, GitPullRequest, RefreshCw,
  Files, Folder, AlertTriangle
} from 'lucide-react'
import CppProjectBanner from '@renderer/components/CppProjectBanner'
import CommentingOptionsPanel from '@renderer/components/CommentingOptionsPanel'
import { useCppProject } from '@renderer/stores/cppProject.store'
import { useSettings } from '@renderer/stores/settings.store'

// ─── Types ──────────────────────────────────────────────────────────────────

type ImportMode = 'fichiers' | 'dossier' | 'depot'

type FileEntry = { name: string; content: string }
type ResultEntry = { name: string; content: string; ok: true } | { name: string; error: string; ok: false }

const DEFAULT_OPTIONS: CommentingOptions = {
  preserveExisting: true,
  addFileHeader: true,
  detailedComments: true,
  applyCodingRules: false,
  onlyChangedFiles: false,
  useContextPipeline: false,
  forceAll: false,
  contextDepth: 3,
  inlineComments: false
}

const SUPPORTED = ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx']

function isSupported(name: string): boolean {
  return SUPPORTED.some((e) => name.toLowerCase().endsWith(e))
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file, 'utf-8')
  })
}

/** Chemin relatif lisible d'un fichier absolu par rapport à la racine du dossier. */
function toRelative(abs: string, root: string): string {
  const normRoot = root.replace(/[\\/]+$/, '')
  if (normRoot && abs.startsWith(normRoot)) {
    return abs.slice(normRoot.length).replace(/^[\\/]+/, '')
  }
  return abs.split(/[\\/]/).pop() ?? abs
}

// ─── Mode selector ───────────────────────────────────────────────────────────

const MODES: { id: ImportMode; label: string; icon: React.ReactNode }[] = [
  { id: 'fichiers', label: 'Fichiers', icon: <Files className="size-4" /> },
  { id: 'dossier', label: 'Dossier CMake', icon: <Folder className="size-4" /> },
  { id: 'depot', label: 'Dépôt Git', icon: <GitBranchIcon className="size-4" /> }
]

// ─── Main component ──────────────────────────────────────────────────────────

export default function Commenter(): React.JSX.Element {
  const [mode, setMode] = useState<ImportMode>('fichiers')
  const [options, setOptions] = useState<CommentingOptions>(DEFAULT_OPTIONS)
  const config = useSettings((s) => s.config)

  // --- Mode Fichiers state ---
  const [files, setFiles] = useState<FileEntry[]>([])
  const [results, setResults] = useState<ResultEntry[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // --- Mode Dossier state ---
  const [folderPath, setFolderPath] = useState('')
  const [folderFileCount, setFolderFileCount] = useState<number | null>(null)
  const [folderFiles, setFolderFiles] = useState<string[]>([])
  const [selectedFolderFiles, setSelectedFolderFiles] = useState<Set<string>>(new Set())
  const [folderScanning, setFolderScanning] = useState(false)
  const [folderRunning, setFolderRunning] = useState(false)

  // --- Mode Dépôt state ---
  const [repos, setRepos] = useState<GitRepository[]>([])
  const [reposLoading, setReposLoading] = useState(false)
  const [reposError, setReposError] = useState('')
  const [selectedRepo, setSelectedRepo] = useState<GitRepository | null>(null)
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState('')
  const [depotLaunched, setDepotLaunched] = useState(false)

  // --- Shared contextual pipeline state ---
  const cppProject = useCppProject((s) => s.project)
  const [ctxRunning, setCtxRunning] = useState(false)
  const [ctxEvents, setCtxEvents] = useState<CommenterContextProgress[]>([])
  const [ctxResult, setCtxResult] = useState<CommenterContextResult | null>(null)
  const [ctxError, setCtxError] = useState<string | null>(null)

  // Subscribe to context pipeline progress events (used by modes Fichiers et Dossier)
  useEffect(() => {
    const unsub = api.commenter.subscribeContext((ev) => {
      setCtxEvents((prev) => [...prev, ev])
    })
    return () => { unsub() }
  }, [])

  // Load repos when switching to depot mode
  useEffect(() => {
    if (mode !== 'depot') return
    setReposLoading(true)
    setReposError('')
    api.commenterPr.listRepos()
      .then(setRepos)
      .catch((e: unknown) => setReposError(e instanceof Error ? e.message : String(e)))
      .finally(() => setReposLoading(false))
  }, [mode])

  // Derived: is the project "ready" for contextual pipeline
  const projectReady =
    mode === 'fichiers' ? cppProject.exists && cppProject.hasCMake
    : mode === 'dossier' ? !!folderPath
    : true // Dépôt : le repo cloné est toujours un root valide

  const noTempPath = !config.tempClonePath

  const isRunning = processing || ctxRunning || folderRunning

  // ─── Mode Fichiers handlers ────────────────────────────────────────────────

  const addFiles = useCallback(async (fileList: File[]) => {
    const supported = fileList.filter((f) => isSupported(f.name))
    const loaded: FileEntry[] = await Promise.all(
      supported.map(async (f) => ({ name: f.name, content: await readFileAsText(f) }))
    )
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name))
      return [...prev, ...loaded.filter((f) => !existing.has(f.name))]
    })
  }, [])

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    await addFiles(Array.from(e.dataTransfer.files))
  }, [addFiles])

  const onFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await addFiles(Array.from(e.target.files))
      e.target.value = ''
    }
  }, [addFiles])

  const onProcessFiles = async (): Promise<void> => {
    if (!files.length) return
    if (options.useContextPipeline) {
      await onRunContextPipelineFiles()
      return
    }
    setProcessing(true)
    setResults([])
    setProgress(`Traitement de ${files.length} fichier(s)…`)
    try {
      const { results: ok, errors } = await api.commenter.process({ files, options })
      const mapped: ResultEntry[] = [
        ...ok.map((r) => ({ ...r, ok: true as const })),
        ...errors.map((e) => ({ name: e.name, error: e.error, ok: false as const }))
      ]
      setResults(mapped)
      setProgress('')
    } catch (err) {
      setProgress(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setProcessing(false)
    }
  }

  const onRunContextPipelineFiles = async (): Promise<void> => {
    if (!files.length || !projectReady) return
    setCtxRunning(true)
    setCtxEvents([])
    setCtxResult(null)
    setCtxError(null)
    try {
      const resolved = await api.commenter.resolveSources({ filenames: files.map((f) => f.name) })
      if (!resolved.ok) { setCtxError(`Résolution échouée : ${resolved.reason}`); return }
      const filePaths: string[] = []
      for (const f of files) {
        const candidates = resolved.resolved[f.name]
        if (candidates && candidates[0]) filePaths.push(candidates[0])
      }
      if (!filePaths.length) { setCtxError("Aucun fichier n'a pu être résolu dans le projet."); return }
      const result = await api.commenter.runContext({
        filePaths,
        forceAll: options.forceAll,
        depth: options.contextDepth,
        tokenBudget: options.contextTokenBudget
      })
      setCtxResult(result)
    } catch (err) {
      setCtxError(err instanceof Error ? err.message : String(err))
    } finally {
      setCtxRunning(false)
    }
  }

  const onSaveFile = async (name: string, content: string): Promise<void> => {
    await api.commenter.saveFile({ filename: name, content })
  }
  const onSaveAll = async (): Promise<void> => {
    const toSave = results.filter((r): r is Extract<ResultEntry, { ok: true }> => r.ok)
    if (!toSave.length) return
    await api.commenter.saveAll({ files: toSave })
  }
  const onSaveCtxFile = async (filePath: string, content: string): Promise<void> => {
    const filename = filePath.split(/[\\/]/).pop() ?? 'output.cpp'
    await api.commenter.saveFile({ filename, content })
  }

  // ─── Mode Dossier handlers ─────────────────────────────────────────────────

  const onChooseDossier = async (): Promise<void> => {
    const result = await api.commenterPr.chooseDir()
    if (!result.ok || !result.path) return
    const path = result.path
    setFolderPath(path)
    setFolderFileCount(null)
    setFolderFiles([])
    setSelectedFolderFiles(new Set())
    setFolderScanning(true)
    try {
      const scan = await api.commenter.scanFolder({ folderPath: path })
      if (scan.ok) {
        setFolderFileCount(scan.count)
        setFolderFiles(scan.filePaths)
        // Tout sélectionné par défaut (comme la sélection de fonctions du testeur).
        setSelectedFolderFiles(new Set(scan.filePaths))
      } else {
        setFolderFileCount(0)
      }
    } finally {
      setFolderScanning(false)
    }
  }

  const toggleFolderFile = (p: string): void => {
    setSelectedFolderFiles((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  const toggleAllFolderFiles = (): void => {
    setSelectedFolderFiles((prev) =>
      prev.size === folderFiles.length ? new Set() : new Set(folderFiles)
    )
  }

  const onRunDossier = async (): Promise<void> => {
    if (!folderPath || selectedFolderFiles.size === 0) return
    setFolderRunning(true)
    setCtxEvents([])
    setCtxResult(null)
    setCtxError(null)
    try {
      const result = await api.commenter.runContext({
        filePaths: [...selectedFolderFiles],
        forceAll: options.useContextPipeline ? options.forceAll : true,
        depth: options.contextDepth,
        tokenBudget: options.contextTokenBudget,
        projectRootOverride: folderPath
      })
      setCtxResult(result)
    } catch (err) {
      setCtxError(err instanceof Error ? err.message : String(err))
    } finally {
      setFolderRunning(false)
    }
  }

  // ─── Mode Dépôt handlers ───────────────────────────────────────────────────

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

  const onLaunchDepotJob = async (): Promise<void> => {
    if (!selectedRepo || !selectedBranch || noTempPath) return
    setDepotLaunched(false)
    await api.gitExplorer.startJob({
      repoId: selectedRepo.id,
      repoName: selectedRepo.name,
      cloneUrl: selectedRepo.cloneUrl,
      branchName: selectedBranch,
      type: 'commentateur',
      options
    })
    setDepotLaunched(true)
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const successCount = results.filter((r) => r.ok).length
  const errorCount = results.filter((r) => !r.ok).length

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-lg font-semibold">Commentateur de code</h1>
        <p className="text-sm text-muted-foreground">
          Génère automatiquement la documentation Doxygen pour des fichiers C/C++.
        </p>
      </div>

      {/* Mode selector */}
      <div className="flex gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            disabled={isRunning}
            className={`flex-1 flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-sm transition-colors
              ${mode === m.id ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'}`}
          >
            {m.icon}
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      {/* ── Mode Fichiers ── */}
      {mode === 'fichiers' && (
        <>
          <CppProjectBanner hint="Requis pour la pipeline contextuelle (call-graph, évaluation par fonction)." />

          <Card
            className={`border-2 border-dashed transition-colors cursor-pointer ${dragging ? 'border-primary bg-primary/5' : 'border-border'}`}
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onClick={() => inputRef.current?.click()}
          >
            <CardContent className="flex flex-col items-center justify-center gap-2 py-8">
              <Upload className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium">Glisser-déposer des fichiers C/C++</p>
              <p className="text-xs text-muted-foreground">.c .cpp .h .hpp .cxx .hxx .cc</p>
              <Button variant="outline" size="sm" type="button">Parcourir…</Button>
            </CardContent>
          </Card>
          <input ref={inputRef} type="file" multiple accept=".c,.cpp,.cc,.cxx,.h,.hpp,.hxx" className="hidden" onChange={onFileInput} />

          {files.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Fichiers sélectionnés ({files.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {files.map((f) => (
                  <div key={f.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <FileCode className="size-3.5" />{f.name}
                    </span>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setFiles((prev) => prev.filter((x) => x.name !== f.name))}>✕</Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Mode Dossier CMake ── */}
      {mode === 'dossier' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Folder className="size-4" />Dossier du projet C/C++
            </CardTitle>
            <CardDescription className="text-xs">
              Sélectionnez le dossier racine contenant votre projet C/C++ (avec ou sans CMakeLists.txt).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <input
                readOnly
                value={folderPath}
                placeholder="Aucun dossier sélectionné"
                className="flex-1 rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
              />
              <Button variant="outline" size="sm" onClick={onChooseDossier} disabled={isRunning}>
                <FolderOpen className="mr-2 size-4" />Parcourir…
              </Button>
            </div>
            {folderScanning && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="size-3 animate-spin" />Scan en cours…</p>}
            {folderFileCount === 0 && !folderScanning && (
              <p className="text-xs text-muted-foreground">Aucun fichier C/C++ trouvé dans ce dossier.</p>
            )}

            {folderFiles.length > 0 && !folderScanning && (
              <div className="space-y-1">
                <label className="flex items-center gap-2 cursor-pointer border-b pb-1">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={selectedFolderFiles.size === folderFiles.length && folderFiles.length > 0}
                    onChange={toggleAllFolderFiles}
                    disabled={isRunning}
                  />
                  <span className="text-sm font-medium">Tout sélectionner</span>
                  <Badge variant="outline" className="ml-auto text-xs">
                    {selectedFolderFiles.size}/{folderFiles.length} fichier(s)
                  </Badge>
                </label>
                <div className="rounded-md border bg-background max-h-52 overflow-y-auto">
                  {folderFiles.map((p) => (
                    <label
                      key={p}
                      className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-muted/30"
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-primary shrink-0"
                        checked={selectedFolderFiles.has(p)}
                        onChange={() => toggleFolderFile(p)}
                        disabled={isRunning}
                      />
                      <FileCode className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="font-mono text-xs truncate" title={p}>{toRelative(p, folderPath)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Mode Dépôt Git ── */}
      {mode === 'depot' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <GitBranchIcon className="size-4" />Dépôt et branche
            </CardTitle>
            <CardDescription className="text-xs">
              Sélectionnez le dépôt Git Tuleap et la branche à commenter. Le dépôt sera cloné automatiquement dans le dossier temp configuré dans les paramètres.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {noTempPath && (
              <div className="flex items-start gap-2 text-xs text-orange-600 dark:text-orange-400">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                <span>Configurez d'abord le dossier de clonage temporaire dans les <strong>Paramètres → Dossier temp</strong>.</span>
              </div>
            )}
            {reposError && <p className="text-sm text-destructive">{reposError}</p>}
            <div className="flex gap-2">
              <select
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                value={selectedRepo?.id ?? ''}
                onChange={(e) => onRepoChange(e.target.value)}
                disabled={reposLoading}
              >
                <option value="">
                  {reposLoading ? 'Chargement…' : repos.length === 0 ? 'Aucun dépôt trouvé' : '— Sélectionner un dépôt —'}
                </option>
                {repos.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <Button variant="outline" size="sm" onClick={loadRepos} disabled={reposLoading} title="Rafraîchir">
                <RefreshCw className={`size-4 ${reposLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            {selectedRepo && (
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                disabled={branchesLoading}
              >
                <option value="">{branchesLoading ? 'Chargement des branches…' : '— Sélectionner une branche —'}</option>
                {branches.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Shared options panel ── */}
      <CommentingOptionsPanel
        options={options}
        onChange={setOptions}
        disabled={isRunning}
        showOnlyChangedFiles={mode === 'depot'}
        showContextPipeline={true}
        projectReady={projectReady}
      />

      {/* ── Action button ── */}
      <div className="flex gap-2">
        {mode === 'fichiers' && (
          <>
            <Button onClick={onProcessFiles} disabled={!files.length || isRunning}>
              {processing || ctxRunning
                ? <><Loader2 className="mr-2 size-4 animate-spin" />{options.useContextPipeline ? 'Évaluation…' : 'Traitement…'}</>
                : options.useContextPipeline
                  ? <><Sparkles className="mr-2 size-4" />Évaluer + commenter par fonction</>
                  : 'Commenter'
              }
            </Button>
            {successCount > 0 && !options.useContextPipeline && (
              <Button variant="outline" onClick={onSaveAll}>
                <FolderOpen className="mr-2 size-4" />Tout enregistrer ({successCount})
              </Button>
            )}
          </>
        )}
        {mode === 'dossier' && (
          <Button onClick={onRunDossier} disabled={!folderPath || selectedFolderFiles.size === 0 || isRunning}>
            {folderRunning || ctxRunning
              ? <><Loader2 className="mr-2 size-4 animate-spin" />Traitement…</>
              : options.useContextPipeline
                ? <><Sparkles className="mr-2 size-4" />Évaluer + commenter ({selectedFolderFiles.size})</>
                : <><Folder className="mr-2 size-4" />Commenter ({selectedFolderFiles.size})</>
            }
          </Button>
        )}
        {mode === 'depot' && (
          <Button
            onClick={onLaunchDepotJob}
            disabled={!selectedRepo || !selectedBranch || noTempPath}
          >
            <GitPullRequest className="mr-2 size-4" />Lancer le job commentateur
          </Button>
        )}
      </div>

      {/* ── Job lancé (mode dépôt) ── */}
      {mode === 'depot' && depotLaunched && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="py-3 text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
            <CheckCircle2 className="size-4" />
            Job lancé — suivez la progression dans le panneau des jobs (icône en bas à droite).
          </CardContent>
        </Card>
      )}

      {/* ── Progress message (mode fichiers basic) ── */}
      {progress && <p className="text-sm text-muted-foreground">{progress}</p>}

      {/* ── Results (mode fichiers, basic pipeline) ── */}
      {mode === 'fichiers' && results.length > 0 && !options.useContextPipeline && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Résultats
              {successCount > 0 && <Badge variant="success">{successCount} OK</Badge>}
              {errorCount > 0 && <Badge variant="destructive">{errorCount} erreur(s)</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {results.map((r) => (
              <div key={r.name} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5">
                  {r.ok ? <CheckCircle2 className="size-4 text-green-500" /> : <XCircle className="size-4 text-destructive" />}
                  <span className={r.ok ? '' : 'text-muted-foreground line-through'}>{r.name}</span>
                  {!r.ok && <span className="text-xs text-destructive">{r.error}</span>}
                </span>
                {r.ok && (
                  <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => onSaveFile(r.name, r.content)}>
                    <Download className="size-3" />Enregistrer
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Contextual pipeline events log (modes fichiers + dossier) ── */}
      {options.useContextPipeline && ctxEvents.length > 0 && (
        <div className="rounded border bg-muted/30 p-2 text-xs font-mono max-h-40 overflow-y-auto space-y-0.5">
          {ctxEvents.map((ev, i) => (
            <div key={i} className="text-muted-foreground">{formatCtxEvent(ev)}</div>
          ))}
        </div>
      )}

      {/* ── Context pipeline error ── */}
      {ctxError && (
        <div className="flex items-start gap-2 text-xs text-destructive">
          <XCircle className="size-3.5 mt-0.5" /><span>{ctxError}</span>
        </div>
      )}

      {/* ── Context pipeline results (modes fichiers + dossier) ── */}
      {ctxResult && (
        <div className="space-y-2 text-sm">
          {ctxResult.warnings.length > 0 && (
            <ul className="text-xs text-orange-600 dark:text-orange-400 list-disc list-inside">
              {ctxResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
          {ctxResult.files.map((f) => (
            <div key={f.filePath} className="rounded border p-2 space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <FileCode className="size-3.5 text-muted-foreground shrink-0" />
                <span className="font-mono text-xs truncate flex-1" title={f.filePath}>{f.filePath}</span>
                <Badge variant="success" className="text-[10px] gap-1"><Sparkles className="size-2.5" />{f.commented}</Badge>
                <Badge variant="outline" className="text-[10px] gap-1"><SkipForward className="size-2.5" />{f.skipped}</Badge>
                <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => void onSaveCtxFile(f.filePath, f.newContent)}>
                  <Download className="size-3" />Enregistrer
                </Button>
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Détail par fonction ({f.plans.length})</summary>
                <ul className="mt-1 space-y-0.5 pl-2">
                  {f.plans.map((p) => (
                    <li key={p.fn.qualifiedName} className="flex items-start gap-1.5">
                      {p.evaluation.sufficient
                        ? <SkipForward className="size-3 mt-0.5 text-muted-foreground" />
                        : <Sparkles className="size-3 mt-0.5 text-green-500" />
                      }
                      <span className="font-mono">{p.fn.qualifiedName}</span>
                      <span className="text-muted-foreground truncate">— {p.evaluation.reason}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatCtxEvent(ev: CommenterContextProgress): string {
  switch (ev.type) {
    case 'index': return `→ indexation : ${ev.root}`
    case 'file-start': return `→ ${ev.filePath} (${ev.functions} fonction(s))`
    case 'evaluate': return `   • évaluation ${ev.functionName} (${ev.index}/${ev.total})`
    case 'verdict': return ev.sufficient ? `     ✓ suffisant — ${ev.reason}` : `     ✗ insuffisant — ${ev.reason}`
    case 'generate': return `     → génération du nouveau commentaire pour ${ev.functionName}`
    case 'file-done': return `→ terminé : ${ev.commented} commenté(s), ${ev.skipped} skip`
    case 'done': return '✓ pipeline contextuelle terminée'
    default: return JSON.stringify(ev)
  }
}
