import * as React from 'react'
import { useState, useCallback, useEffect, useRef } from 'react'
import { api } from '@renderer/lib/api'
import type { TestgenPipelineProgress, TestgenPipelineResult } from '../../../preload'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  FileCode, Download, FolderOpen, Loader2, CheckCircle2, AlertCircle, FlaskConical,
  Hammer, Wrench, AlertTriangle
} from 'lucide-react'
import SourceInputPanel from '@renderer/components/SourceInputPanel'
import { useCppProject } from '@renderer/stores/cppProject.store'
import type { SourceInputMode, GitRepository, GitBranch } from '@shared/types'

type ParsedFunction = {
  name: string
  signature: string
  returnType: string
  sourceCode: string
  lineNumber: number
}

type FileInfo = {
  name: string
  language: string
  totalLines: number
  headerFile?: string
}

type TestFile = { name: string; content: string }

type GenerationMetrics = {
  apiCalls: number
  testsGenerated: number
  testsFailed: number
  totalTime: number
}

type Phase = 'idle' | 'extracting' | 'generating' | 'done'

const SOURCE_EXTS = ['.c', '.cpp', '.cc', '.cxx']
function isSourceFile(name: string): boolean {
  return SOURCE_EXTS.some((e) => name.toLowerCase().endsWith(e))
}

export default function TestGenerator(): React.JSX.Element {
  // ---- Source file ----
  const [filename, setFilename] = useState('')
  const [content, setContent] = useState('')
  const [sourceFilePath, setSourceFilePath] = useState<string | null>(null)

  // ---- Source input mode ----
  const [sourceMode, setSourceMode] = useState<SourceInputMode>('files')

  // ---- Folder mode ----
  const cppProjectStore = useCppProject()
  const cppProject = cppProjectStore.project
  const [folderFiles, setFolderFiles] = useState<string[]>([])
  const [folderLoading, setFolderLoading] = useState(false)
  const [selectedFolderFile, setSelectedFolderFile] = useState<string | null>(null)

  // ---- Git mode (Tuleap) ----
  const [gitRepos, setGitRepos] = useState<GitRepository[]>([])
  const [gitLoadingRepos, setGitLoadingRepos] = useState(false)
  const [gitSelectedRepo, setGitSelectedRepo] = useState<GitRepository | null>(null)
  const [gitBranches, setGitBranches] = useState<GitBranch[]>([])
  const [gitLoadingBranches, setGitLoadingBranches] = useState(false)
  const [gitSelectedBranch, setGitSelectedBranch] = useState<string | null>(null)
  const [gitOnlyRecent, setGitOnlyRecent] = useState(false)
  const [gitCloneState, setGitCloneState] = useState<'idle' | 'cloning' | 'ready' | 'error'>('idle')
  const [gitFiles, setGitFiles] = useState<string[]>([])
  const [gitError, setGitError] = useState<string | null>(null)
  const [selectedGitFile, setSelectedGitFile] = useState<string | null>(null)
  const gitCloneDirRef = useRef<string | null>(null)

  // ---- Extraction & generation ----
  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState('')
  const [functions, setFunctions] = useState<ParsedFunction[]>([])
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [selectedFunctions, setSelectedFunctions] = useState<Set<string>>(new Set())
  const [testFiles, setTestFiles] = useState<TestFile[]>([])
  const [metrics, setMetrics] = useState<GenerationMetrics | null>(null)

  // ---- Pipeline (P3) ----
  const [pipelineMode, setPipelineMode] = useState<'basic' | 'advanced'>('basic')
  const [buildEnabled, setBuildEnabled] = useState(true)
  const [preset, setPreset] = useState('ci-gcc')
  const [maxRepairs, setMaxRepairs] = useState(3)
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [pipelineEvents, setPipelineEvents] = useState<TestgenPipelineProgress[]>([])
  const [pipelineResult, setPipelineResult] = useState<TestgenPipelineResult | null>(null)
  const [pipelineError, setPipelineError] = useState<string | null>(null)

  const projectReady = cppProject.exists && cppProject.hasCMake

  // Subscribe to pipeline events
  useEffect(() => {
    const unsub = api.testgen.subscribePipeline((ev) => {
      setPipelineEvents((prev) => [...prev, ev])
    })
    return () => { unsub() }
  }, [])

  // Cleanup git clone dir on unmount
  useEffect(() => {
    return () => {
      if (gitCloneDirRef.current) {
        void api.testgen.cleanupCloneDir({ cloneDir: gitCloneDirRef.current })
      }
    }
  }, [])

  // Load Tuleap repos when entering git mode
  useEffect(() => {
    if (sourceMode !== 'git' || gitRepos.length > 0) return
    setGitLoadingRepos(true)
    api.gitExplorer.listRepos()
      .then(setGitRepos)
      .catch(() => setGitRepos([]))
      .finally(() => setGitLoadingRepos(false))
  }, [sourceMode, gitRepos.length])

  // Auto-extract functions whenever a file is loaded
  useEffect(() => {
    if (!filename || !content) return
    void doExtract(filename, content)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename, content])

  async function doExtract(name: string, src: string): Promise<void> {
    setPhase('extracting')
    setStatus('Extraction des fonctions…')
    setFunctions([])
    setFileInfo(null)
    setSelectedFunctions(new Set())
    setTestFiles([])
    setMetrics(null)
    try {
      const result = await api.testgen.extractFunctions({ filename: name, content: src })
      const fns = result.functions as ParsedFunction[]
      setFunctions(fns)
      setFileInfo(result.fileInfo as FileInfo)
      setSelectedFunctions(new Set(fns.map((f) => f.name)))
      setStatus('')
      setPhase('idle')
    } catch (err) {
      setStatus(`Erreur d'extraction : ${err instanceof Error ? err.message : String(err)}`)
      setPhase('idle')
    }
  }

  // ---- Reset helper ----
  const resetFile = useCallback(() => {
    setFilename('')
    setContent('')
    setSourceFilePath(null)
    setFunctions([])
    setFileInfo(null)
    setSelectedFunctions(new Set())
    setTestFiles([])
    setMetrics(null)
    setStatus('')
    setPhase('idle')
  }, [])

  // ---- Folder mode handlers ----
  const onFolderPick = useCallback(async () => {
    setFolderLoading(true)
    try {
      const picked = await cppProjectStore.pick()
      if (!picked.path) return
      const res = await api.testgen.listFolderFiles({ folderPath: picked.path })
      if (res.ok) {
        setFolderFiles(res.files.filter(isSourceFile))
        setSelectedFolderFile(null)
        resetFile()
      }
    } finally {
      setFolderLoading(false)
    }
  }, [cppProjectStore, resetFile])

  const onFolderFileSelect = useCallback(async (rel: string) => {
    if (!cppProject.path) return
    setSelectedFolderFile(rel)
    const res = await api.testgen.readFileFromDir({ cloneDir: cppProject.path, relativePath: rel })
    if (res.ok) {
      const name = rel.split('/').pop() ?? rel
      setFilename(name)
      setContent(res.content)
      setSourceFilePath(`${cppProject.path}/${rel}`.replace(/\\/g, '/'))
    }
  }, [cppProject.path])

  // ---- Git mode handlers ----
  const onGitRepoSelect = useCallback((repo: GitRepository) => {
    setGitSelectedRepo(repo)
    setGitSelectedBranch(null)
    setGitBranches([])
    setGitFiles([])
    setGitCloneState('idle')
    setGitError(null)
    setSelectedGitFile(null)
    resetFile()
    setGitLoadingBranches(true)
    api.gitExplorer.listBranches(repo.id)
      .then(setGitBranches)
      .catch(() => setGitBranches([]))
      .finally(() => setGitLoadingBranches(false))
  }, [resetFile])

  const onGitBranchSelect = useCallback(async (branch: string) => {
    if (!gitSelectedRepo) return
    setGitSelectedBranch(branch)
    setGitFiles([])
    setGitError(null)
    setSelectedGitFile(null)
    resetFile()
    if (gitCloneDirRef.current) {
      void api.testgen.cleanupCloneDir({ cloneDir: gitCloneDirRef.current })
      gitCloneDirRef.current = null
    }
    setGitCloneState('cloning')
    const res = await api.testgen.gitCloneAndList({
      repoUrl: gitSelectedRepo.cloneUrl,
      branch,
      onlyRecentFiles: gitOnlyRecent
    })
    if (res.ok) {
      gitCloneDirRef.current = res.cloneDir
      setGitFiles(res.files.filter(isSourceFile))
      setGitCloneState('ready')
    } else {
      setGitError(res.error)
      setGitCloneState('error')
    }
  }, [gitSelectedRepo, gitOnlyRecent, resetFile])

  const onGitFileSelect = useCallback(async (rel: string) => {
    const cloneDir = gitCloneDirRef.current
    if (!cloneDir) return
    setSelectedGitFile(rel)
    const res = await api.testgen.readFileFromDir({ cloneDir, relativePath: rel })
    if (res.ok) {
      const name = rel.split('/').pop() ?? rel
      setFilename(name)
      setContent(res.content)
      setSourceFilePath(`${cloneDir}/${rel}`.replace(/\\/g, '/'))
    }
  }, [])

  // ---- Function selection ----
  const toggleFunction = (name: string): void => {
    setSelectedFunctions((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleAllFunctions = (): void => {
    setSelectedFunctions((prev) =>
      prev.size === functions.length ? new Set() : new Set(functions.map((f) => f.name))
    )
  }

  // ---- Generation ----
  const onGenerate = async (): Promise<void> => {
    if (!filename || !content || selectedFunctions.size === 0) return
    setPhase('generating')
    setStatus(`Génération des tests pour ${selectedFunctions.size} fonction(s)…`)
    setTestFiles([])
    setMetrics(null)
    try {
      const result = await api.testgen.generateAll({
        filename,
        content,
        onlyFunctions: [...selectedFunctions],
        sourceFilePath: sourceFilePath ?? undefined
      })
      setTestFiles(result.testFiles as TestFile[])
      setMetrics(result.metrics as GenerationMetrics)
      setStatus('')
      setPhase('done')
    } catch (err) {
      setStatus(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
      setPhase('idle')
    }
  }

  const onSaveFile = async (name: string, fileContent: string): Promise<void> => {
    await api.testgen.saveFile({ filename: name, content: fileContent })
  }

  const onSaveAll = async (): Promise<void> => {
    if (!testFiles.length) return
    await api.testgen.saveAll({ files: testFiles })
  }

  const onRunPipeline = async (): Promise<void> => {
    if (!filename || !projectReady) return
    setPipelineRunning(true)
    setPipelineEvents([])
    setPipelineResult(null)
    setPipelineError(null)
    try {
      // Use the full sourceFilePath when available (folder/git mode), fall back to resolve
      let resolvedPath = sourceFilePath
      if (!resolvedPath) {
        const resolved = await api.testgen.resolveSource({ filename })
        if (!resolved.ok) {
          setPipelineError(
            resolved.reason === 'not-found'
              ? `Fichier "${filename}" introuvable dans la racine projet.`
              : `Source non résolue (${resolved.reason}).`
          )
          return
        }
        resolvedPath = resolved.candidates[0] ?? null
      }
      if (!resolvedPath) { setPipelineError('Aucun fichier source résolu.'); return }
      const result = await api.testgen.runPipeline({
        sourceFilePath: resolvedPath,
        onlyFunctions: selectedFunctions.size > 0 ? [...selectedFunctions] : undefined,
        buildEnabled,
        preset,
        maxRepairs
      })
      setPipelineResult(result)
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : String(err))
    } finally {
      setPipelineRunning(false)
    }
  }

  const isExtracting = phase === 'extracting'
  const isGenerating = phase === 'generating'
  const isLoading = isExtracting || isGenerating
  const isPython = filename.endsWith('.py')
  const framework = isPython ? 'pytest' : 'Google Test'
  const showPipeline = !isPython && projectReady
  const canGenerate = !isLoading && selectedFunctions.size > 0
  const isAdvanced = pipelineMode === 'advanced' && showPipeline

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-lg font-semibold">Générateur de tests</h1>
        <p className="text-sm text-muted-foreground">
          Génère automatiquement des tests unitaires ({framework}) pour du code C/C++ ou Python.
        </p>
      </div>

      {/* Source input panel */}
      <SourceInputPanel
        mode={sourceMode}
        onModeChange={(m) => {
          setSourceMode(m)
          setSelectedFolderFile(null)
          setSelectedGitFile(null)
          resetFile()
        }}
        currentFileName={filename || null}
        onFileLoaded={({ name, content: text }) => {
          setFilename(name)
          setContent(text)
        }}
        folderRoot={cppProject.path}
        folderFiles={folderFiles}
        folderLoading={folderLoading}
        selectedFolderFile={selectedFolderFile}
        onFolderPick={() => { void onFolderPick() }}
        onFolderFileSelect={(rel) => { void onFolderFileSelect(rel) }}
        gitRepos={gitRepos}
        gitLoadingRepos={gitLoadingRepos}
        gitSelectedRepo={gitSelectedRepo}
        gitBranches={gitBranches}
        gitLoadingBranches={gitLoadingBranches}
        gitSelectedBranch={gitSelectedBranch}
        gitOnlyRecent={gitOnlyRecent}
        gitCloneState={gitCloneState}
        gitFiles={gitFiles}
        gitError={gitError}
        selectedGitFile={selectedGitFile}
        onGitRepoSelect={onGitRepoSelect}
        onGitBranchSelect={(b) => { void onGitBranchSelect(b) }}
        onGitOnlyRecentChange={setGitOnlyRecent}
        onGitFileSelect={(rel) => { void onGitFileSelect(rel) }}
      />

      {/* Function selection — shown after auto-extract */}
      {(isExtracting || functions.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {isExtracting
                ? <><Loader2 className="size-4 animate-spin" />Extraction…</>
                : (
                  <>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={selectedFunctions.size === functions.length && functions.length > 0}
                        onChange={toggleAllFunctions}
                      />
                      <span>{filename}</span>
                    </label>
                    <Badge variant="outline" className="ml-auto">
                      {selectedFunctions.size}/{functions.length} sélectionnée(s)
                    </Badge>
                    {fileInfo && <Badge variant="secondary" className="text-xs">{fileInfo.language}</Badge>}
                  </>
                )
              }
            </CardTitle>
          </CardHeader>
          {!isExtracting && functions.length > 0 && (
            <CardContent className="space-y-1 pt-0">
              {functions.map((f) => (
                <label
                  key={`${f.name}-${f.lineNumber}`}
                  className="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-muted/30 rounded px-1"
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary shrink-0"
                    checked={selectedFunctions.has(f.name)}
                    onChange={() => toggleFunction(f.name)}
                  />
                  <FileCode className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="font-mono text-xs flex-1 truncate">{f.signature}</span>
                  <span className="text-xs text-muted-foreground shrink-0">L.{f.lineNumber}</span>
                </label>
              ))}
            </CardContent>
          )}
          {!isExtracting && functions.length === 0 && (
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground">
                Aucune fonction trouvée dans ce fichier. Assurez-vous de sélectionner un fichier source (.c) contenant des implémentations (avec corps de fonction).
              </p>
            </CardContent>
          )}
        </Card>
      )}

      {/* Actions */}
      {functions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => { void (isAdvanced ? onRunPipeline() : onGenerate()) }}
            disabled={isAdvanced ? (!projectReady || !filename || pipelineRunning) : !canGenerate}
          >
            {(isGenerating || pipelineRunning)
              ? <><Loader2 className="mr-2 size-4 animate-spin" />{isAdvanced ? 'Pipeline en cours…' : 'Génération…'}</>
              : isAdvanced
                ? <><Wrench className="mr-2 size-4" />Générer + Build pipeline ({selectedFunctions.size})</>
                : <><FlaskConical className="mr-2 size-4" />Générer les tests ({selectedFunctions.size})</>
            }
          </Button>
          {testFiles.length > 0 && (
            <Button variant="outline" onClick={() => { void onSaveAll() }}>
              <FolderOpen className="mr-2 size-4" />Tout enregistrer ({testFiles.length})
            </Button>
          )}
        </div>
      )}

      {status && (
        <p className={`text-sm ${status.startsWith('Erreur') ? 'text-destructive' : 'text-muted-foreground'}`}>
          {status}
        </p>
      )}

      {/* Generated test files */}
      {testFiles.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Tests générés
              <Badge variant="success">{testFiles.length} fichier(s)</Badge>
              {metrics && (
                <Badge variant="outline" className="text-xs">
                  {metrics.testsGenerated} tests · {metrics.totalTime.toFixed(1)}s
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {metrics && metrics.testsFailed > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400">
                <AlertCircle className="size-3.5" />
                {metrics.testsFailed} test(s) ont échoué à la génération
              </div>
            )}
            {testFiles.map((f) => (
              <div key={f.name} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-green-500" />
                  {f.name}
                </span>
                <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1"
                  onClick={() => { void onSaveFile(f.name, f.content) }}>
                  <Download className="size-3" />Enregistrer
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Metrics */}
      {metrics && (
        <div className="text-xs text-muted-foreground flex gap-4">
          <span>{metrics.apiCalls} appels API</span>
          <span>{metrics.testsGenerated} tests générés</span>
          {metrics.testsFailed > 0 && <span className="text-orange-500">{metrics.testsFailed} échecs</span>}
          <span>{metrics.totalTime.toFixed(1)}s</span>
        </div>
      )}

      {/* Pipeline choice — folder mode only, C/C++ only */}
      {showPipeline && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Hammer className="size-4" />
              Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className={`flex items-start gap-2 cursor-pointer rounded-md border p-2 transition-colors ${pipelineMode === 'basic' ? 'border-primary bg-primary/5' : ''}`}>
                <input
                  type="radio"
                  name="pipeline-mode"
                  checked={pipelineMode === 'basic'}
                  onChange={() => setPipelineMode('basic')}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <div>
                  <div className="text-sm font-medium">Basique</div>
                  <div className="text-xs text-muted-foreground">Génération rapide, un appel par fonction</div>
                </div>
              </label>
              <label className={`flex items-start gap-2 cursor-pointer rounded-md border p-2 transition-colors ${pipelineMode === 'advanced' ? 'border-primary bg-primary/5' : ''}`}>
                <input
                  type="radio"
                  name="pipeline-mode"
                  checked={pipelineMode === 'advanced'}
                  onChange={() => setPipelineMode('advanced')}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <div>
                  <div className="text-sm font-medium">Avancée</div>
                  <div className="text-xs text-muted-foreground">Call-graph + CMake build + self-repair</div>
                </div>
              </label>
            </div>

            {pipelineMode === 'advanced' && (
              <div className="space-y-3 pt-1 border-t">
                {!projectReady && (
                  <div className="flex items-start gap-2 text-xs text-orange-600 dark:text-orange-400">
                    <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                    <span>Sélectionne d'abord un dossier C/C++ contenant un <code>CMakeLists.txt</code>.</span>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={buildEnabled}
                      onChange={(e) => setBuildEnabled(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-primary" disabled={!projectReady} />
                    <div>
                      <div>Build self-repair</div>
                      <div className="text-xs text-muted-foreground">cmake --workflow → réessaye sur erreur</div>
                    </div>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span>Preset CMake</span>
                    <input type="text" value={preset} onChange={(e) => setPreset(e.target.value)}
                      className="border rounded px-2 py-1 text-xs font-mono bg-background"
                      placeholder="ci-gcc" disabled={!projectReady} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span>Réparations max.</span>
                    <input type="number" min={0} max={5} value={maxRepairs}
                      onChange={(e) => setMaxRepairs(Number.parseInt(e.target.value || '0', 10))}
                      className="border rounded px-2 py-1 text-xs font-mono bg-background"
                      disabled={!projectReady || !buildEnabled} />
                  </label>
                </div>
              </div>
            )}

            {pipelineError && (
              <div className="flex items-start gap-2 text-xs text-destructive">
                <AlertCircle className="size-3.5 mt-0.5" /><span>{pipelineError}</span>
              </div>
            )}
            {pipelineEvents.length > 0 && (
              <div className="rounded border bg-muted/30 p-2 text-xs font-mono max-h-40 overflow-y-auto space-y-0.5">
                {pipelineEvents.map((ev, i) => (
                  <div key={i} className="text-muted-foreground">{formatPipelineEvent(ev)}</div>
                ))}
              </div>
            )}
            {pipelineResult && <PipelineResultPanel result={pipelineResult} />}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function formatPipelineEvent(ev: TestgenPipelineProgress): string {
  switch (ev.type) {
    case 'index': return `→ indexation du projet : ${ev.root}`
    case 'discover': return `→ tests détectés : ${ev.testDir ?? '(aucun)'} (template: ${ev.templateFile ?? '-'} / ${ev.marker ?? '-'})`
    case 'generate': return `→ génération ${ev.functionName} (${ev.index}/${ev.total})`
    case 'write': return `✓ écrit ${ev.filePath}`
    case 'cmake-update': return `✓ CMakeLists ${ev.cmakeFile} +${ev.inserted.length} source(s)`
    case 'build-start': return `→ build itération ${ev.iteration} (cmake --workflow --preset ${ev.preset})`
    case 'build-result': return ev.ok
      ? `✓ build OK (itération ${ev.iteration}, ${(ev.durationMs / 1000).toFixed(1)}s)`
      : `✗ build KO (itération ${ev.iteration}, ${(ev.durationMs / 1000).toFixed(1)}s)`
    case 'repair': return `→ réparation auto itération ${ev.iteration} sur ${ev.failingFiles.length} fichier(s)`
    case 'done': return '✓ pipeline terminée'
    default: return JSON.stringify(ev)
  }
}

function PipelineResultPanel({ result }: { result: TestgenPipelineResult }): React.JSX.Element {
  const buildOk = result.build?.ok ?? null
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">{result.testFiles.length} fichier(s)</Badge>
        {result.cmakeInserted.length > 0 && (
          <Badge variant="outline" className="text-xs">CMake +{result.cmakeInserted.length}</Badge>
        )}
        {buildOk === true && <Badge variant="success">Build OK</Badge>}
        {buildOk === false && <Badge variant="destructive">Build KO</Badge>}
        {result.iterations > 0 && (
          <Badge variant="outline" className="text-xs">{result.iterations} itération(s)</Badge>
        )}
      </div>
      {result.warnings.length > 0 && (
        <ul className="text-xs text-orange-600 dark:text-orange-400 list-disc list-inside">
          {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
      <div className="space-y-1">
        {result.testFiles.map((f) => (
          <div key={f.filePath} className="flex items-center gap-2 text-xs font-mono">
            <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />
            <span className="truncate flex-1" title={f.filePath}>{f.filePath}</span>
            <Badge variant="outline" className="text-[10px]">it.{f.iteration}</Badge>
          </div>
        ))}
      </div>
      {result.build && !result.build.ok && result.build.errors.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-destructive">
            {result.build.errors.length} erreur(s) de compilation
          </summary>
          <ul className="mt-1 space-y-0.5 pl-4 list-disc text-muted-foreground">
            {result.build.errors.slice(0, 10).map((e, i) => (
              <li key={i} className="font-mono">
                {[e.filePath, e.line, e.column].filter(Boolean).join(':')} — {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
