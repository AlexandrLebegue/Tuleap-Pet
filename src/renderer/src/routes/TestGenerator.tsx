import * as React from 'react'
import { useState, useRef, useCallback, useEffect } from 'react'
import { api } from '@renderer/lib/api'
import type { TestgenPipelineProgress, TestgenPipelineResult } from '../../../preload'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  Upload, FileCode, Download, FolderOpen, Loader2, CheckCircle2, AlertCircle, FlaskConical,
  Hammer, Wrench, AlertTriangle
} from 'lucide-react'
import CppProjectBanner from '@renderer/components/CppProjectBanner'
import { useCppProject } from '@renderer/stores/cppProject.store'

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

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file, 'utf-8')
  })
}

const SUPPORTED = ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx', '.py']
function isSupported(name: string): boolean {
  return SUPPORTED.some((e) => name.toLowerCase().endsWith(e))
}

export default function TestGenerator(): React.JSX.Element {
  const [filename, setFilename] = useState('')
  const [content, setContent] = useState('')
  const [dragging, setDragging] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState('')
  const [progressDetail, setProgressDetail] = useState('')
  const [functions, setFunctions] = useState<ParsedFunction[]>([])
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [testFiles, setTestFiles] = useState<TestFile[]>([])
  const [metrics, setMetrics] = useState<GenerationMetrics | null>(null)

  // Pipeline (P3) state
  const cppProject = useCppProject((s) => s.project)
  const [pipelineEnabled, setPipelineEnabled] = useState(false)
  const [buildEnabled, setBuildEnabled] = useState(true)
  const [preset, setPreset] = useState('ci-gcc')
  const [maxRepairs, setMaxRepairs] = useState(3)
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [pipelineEvents, setPipelineEvents] = useState<TestgenPipelineProgress[]>([])
  const [pipelineResult, setPipelineResult] = useState<TestgenPipelineResult | null>(null)
  const [pipelineError, setPipelineError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  const projectReady = cppProject.exists && cppProject.hasCMake
  const isPipelineRoute = !filename.endsWith('.py')

  useEffect(() => {
    const unsub = api.testgen.subscribePipeline((ev) => {
      setPipelineEvents((prev) => [...prev, ev])
    })
    return () => { unsub() }
  }, [])

  const loadFile = useCallback(async (file: File) => {
    if (!isSupported(file.name)) return
    const text = await readFileAsText(file)
    setFilename(file.name)
    setContent(text)
    setFunctions([])
    setFileInfo(null)
    setTestFiles([])
    setMetrics(null)
    setStatus('')
    setPhase('idle')
  }, [])

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = Array.from(e.dataTransfer.files).find((f) => isSupported(f.name))
    if (file) await loadFile(file)
  }, [loadFile])

  const onFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) { await loadFile(e.target.files[0]); e.target.value = '' }
  }, [loadFile])

  const onExtract = async (): Promise<void> => {
    if (!filename || !content) return
    setPhase('extracting')
    setStatus('Extraction des fonctions…')
    setFunctions([])
    setFileInfo(null)
    setTestFiles([])
    setMetrics(null)
    try {
      const result = await api.testgen.extractFunctions({ filename, content })
      setFunctions(result.functions as ParsedFunction[])
      setFileInfo(result.fileInfo as FileInfo)
      setStatus('')
      setPhase('idle')
    } catch (err) {
      setStatus(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
      setPhase('idle')
    }
  }

  const onGenerateAll = async (): Promise<void> => {
    if (!filename || !content) return
    setPhase('generating')
    setStatus('Génération des tests en cours…')
    setProgressDetail('')
    setTestFiles([])
    setMetrics(null)
    try {
      const result = await api.testgen.generateAll({ filename, content })
      setTestFiles(result.testFiles as TestFile[])
      setMetrics(result.metrics as GenerationMetrics)
      setStatus('')
      setProgressDetail('')
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
      const resolved = await api.testgen.resolveSource({ filename })
      if (!resolved.ok) {
        setPipelineError(
          resolved.reason === 'not-found'
            ? `Fichier "${filename}" introuvable dans la racine projet sélectionnée.`
            : `Source non résolue (${resolved.reason}).`
        )
        return
      }
      const sourceFilePath = resolved.candidates[0]
      if (!sourceFilePath) {
        setPipelineError('Aucun fichier candidat retourné par la résolution.')
        return
      }
      const result = await api.testgen.runPipeline({
        sourceFilePath,
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

  const isLoading = phase === 'extracting' || phase === 'generating'
  const canExtract = !!filename && !isLoading
  const canGenerate = !!filename && !isLoading

  const isPython = filename.endsWith('.py')
  const framework = isPython ? 'pytest' : 'Google Test'

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-lg font-semibold">Générateur de tests</h1>
        <p className="text-sm text-muted-foreground">
          Génère automatiquement des tests unitaires ({framework}) pour du code C/C++ ou Python.
        </p>
      </div>

      <CppProjectBanner hint="Indispensable pour l'analyse de call-graph (callers/callees) et la mise à jour du CMakeLists." />

      {/* Drop zone */}
      <Card
        className={`border-2 border-dashed transition-colors cursor-pointer ${dragging ? 'border-primary bg-primary/5' : 'border-border'}`}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => inputRef.current?.click()}
      >
        <CardContent className="flex flex-col items-center justify-center gap-2 py-8">
          <Upload className="size-8 text-muted-foreground" />
          {filename
            ? <p className="text-sm font-medium text-primary">{filename}</p>
            : <p className="text-sm font-medium">Glisser-déposer un fichier source</p>
          }
          <p className="text-xs text-muted-foreground">.c .cpp .h .hpp .cxx .hxx .cc .py</p>
          <Button variant="outline" size="sm" type="button">{filename ? 'Changer…' : 'Parcourir…'}</Button>
        </CardContent>
      </Card>
      <input ref={inputRef} type="file" accept=".c,.cpp,.cc,.cxx,.h,.hpp,.hxx,.py" className="hidden" onChange={onFileInput} />

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={onExtract} disabled={!canExtract} variant="outline">
          {phase === 'extracting' ? <><Loader2 className="mr-2 size-4 animate-spin" />Extraction…</> : 'Extraire les fonctions'}
        </Button>
        <Button onClick={onGenerateAll} disabled={!canGenerate}>
          {phase === 'generating'
            ? <><Loader2 className="mr-2 size-4 animate-spin" />Génération…</>
            : <><FlaskConical className="mr-2 size-4" />Générer tous les tests</>
          }
        </Button>
        {testFiles.length > 0 && (
          <Button variant="outline" onClick={onSaveAll}>
            <FolderOpen className="mr-2 size-4" />Tout enregistrer ({testFiles.length})
          </Button>
        )}
      </div>

      {status && <p className="text-sm text-muted-foreground">{status}</p>}
      {progressDetail && <p className="text-xs text-muted-foreground">{progressDetail}</p>}

      {/* Extracted functions */}
      {functions.length > 0 && fileInfo && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Fonctions extraites
              <Badge variant="outline">{functions.length} fonction(s)</Badge>
              <Badge variant="secondary" className="text-xs">{fileInfo.language}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {functions.map((f) => (
              <div key={`${f.name}-${f.lineNumber}`} className="flex items-center gap-2 text-sm py-0.5">
                <FileCode className="size-3.5 text-muted-foreground shrink-0" />
                <span className="font-mono text-xs">{f.signature}</span>
                <span className="text-xs text-muted-foreground ml-auto shrink-0">L.{f.lineNumber}</span>
              </div>
            ))}
          </CardContent>
        </Card>
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
                  onClick={() => onSaveFile(f.name, f.content)}>
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

      {/* Pipeline avancée (P3) — C/C++ only, requires project root + CMake */}
      {isPipelineRoute && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Hammer className="size-4" />
              Pipeline avancée (call-graph + CMake + build)
              <label className="ml-auto flex items-center gap-2 text-xs font-normal">
                <input
                  type="checkbox"
                  checked={pipelineEnabled}
                  onChange={(e) => setPipelineEnabled(e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                Activer
              </label>
            </CardTitle>
          </CardHeader>
          {pipelineEnabled && (
            <CardContent className="space-y-3">
              {!projectReady && (
                <div className="flex items-start gap-2 text-xs text-orange-600 dark:text-orange-400">
                  <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                  <span>
                    Sélectionne d'abord la racine du projet C/C++ contenant un <code>CMakeLists.txt</code> via le bandeau ci-dessus.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={buildEnabled}
                    onChange={(e) => setBuildEnabled(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-primary"
                    disabled={!projectReady}
                  />
                  <div>
                    <div>Build self-repair</div>
                    <div className="text-xs text-muted-foreground">cmake --workflow → réessaye sur erreur</div>
                  </div>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span>Preset CMake</span>
                  <input
                    type="text"
                    value={preset}
                    onChange={(e) => setPreset(e.target.value)}
                    className="border rounded px-2 py-1 text-xs font-mono bg-background"
                    placeholder="ci-gcc"
                    disabled={!projectReady}
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span>Itérations de réparation max.</span>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={maxRepairs}
                    onChange={(e) => setMaxRepairs(Number.parseInt(e.target.value || '0', 10))}
                    className="border rounded px-2 py-1 text-xs font-mono bg-background"
                    disabled={!projectReady || !buildEnabled}
                  />
                </label>
              </div>

              <Button
                onClick={onRunPipeline}
                disabled={!projectReady || !filename || pipelineRunning}
              >
                {pipelineRunning
                  ? <><Loader2 className="mr-2 size-4 animate-spin" />Pipeline en cours…</>
                  : <><Wrench className="mr-2 size-4" />Générer + Build pipeline</>
                }
              </Button>

              {pipelineError && (
                <div className="flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="size-3.5 mt-0.5" />
                  <span>{pipelineError}</span>
                </div>
              )}

              {pipelineEvents.length > 0 && (
                <div className="rounded border bg-muted/30 p-2 text-xs font-mono max-h-40 overflow-y-auto space-y-0.5">
                  {pipelineEvents.map((ev, i) => (
                    <div key={i} className="text-muted-foreground">
                      {formatPipelineEvent(ev)}
                    </div>
                  ))}
                </div>
              )}

              {pipelineResult && <PipelineResultPanel result={pipelineResult} />}
            </CardContent>
          )}
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
