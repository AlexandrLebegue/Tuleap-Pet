import * as React from 'react'
import { useState, useRef, useCallback, useEffect } from 'react'
import { api } from '@renderer/lib/api'
import type { CommenterContextProgress, CommenterContextResult } from '../../../preload'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  Upload, FileCode, CheckCircle2, XCircle, Download, FolderOpen, Loader2,
  Sparkles, AlertTriangle, SkipForward
} from 'lucide-react'
import CppProjectBanner from '@renderer/components/CppProjectBanner'
import { useCppProject } from '@renderer/stores/cppProject.store'

type FileEntry = { name: string; content: string }
type ResultEntry = { name: string; content: string; ok: true } | { name: string; error: string; ok: false }

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

export default function Commenter(): React.JSX.Element {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS)
  const [results, setResults] = useState<ResultEntry[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Pipeline contextuelle (P4) state
  const cppProject = useCppProject((s) => s.project)
  const [contextEnabled, setContextEnabled] = useState(false)
  const [forceAll, setForceAll] = useState(false)
  const [ctxRunning, setCtxRunning] = useState(false)
  const [ctxEvents, setCtxEvents] = useState<CommenterContextProgress[]>([])
  const [ctxResult, setCtxResult] = useState<CommenterContextResult | null>(null)
  const [ctxError, setCtxError] = useState<string | null>(null)

  const projectReady = cppProject.exists && cppProject.hasCMake

  useEffect(() => {
    const unsub = api.commenter.subscribeContext((ev) => {
      setCtxEvents((prev) => [...prev, ev])
    })
    return () => { unsub() }
  }, [])

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
    const fileList = Array.from(e.dataTransfer.files)
    await addFiles(fileList)
  }, [addFiles])

  const onFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await addFiles(Array.from(e.target.files))
      e.target.value = ''
    }
  }, [addFiles])

  const removeFile = (name: string): void => {
    setFiles((prev) => prev.filter((f) => f.name !== name))
  }

  const toggleOption = (key: keyof Options): void => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const onProcess = async (): Promise<void> => {
    if (!files.length) return
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

  const onSaveFile = async (name: string, content: string): Promise<void> => {
    await api.commenter.saveFile({ filename: name, content })
  }

  const onSaveAll = async (): Promise<void> => {
    const toSave = results.filter((r): r is Extract<ResultEntry, { ok: true }> => r.ok)
    if (!toSave.length) return
    await api.commenter.saveAll({ files: toSave })
  }

  const onRunContextPipeline = async (): Promise<void> => {
    if (!files.length || !projectReady) return
    setCtxRunning(true)
    setCtxEvents([])
    setCtxResult(null)
    setCtxError(null)
    try {
      const resolved = await api.commenter.resolveSources({
        filenames: files.map((f) => f.name)
      })
      if (!resolved.ok) {
        setCtxError(`Résolution échouée : ${resolved.reason}`)
        return
      }
      const filePaths: string[] = []
      for (const f of files) {
        const candidates = resolved.resolved[f.name]
        if (candidates && candidates[0]) filePaths.push(candidates[0])
      }
      if (!filePaths.length) {
        setCtxError('Aucun fichier glissé-déposé n\'a pu être résolu dans le projet sélectionné.')
        return
      }
      const result = await api.commenter.runContext({ filePaths, forceAll })
      setCtxResult(result)
    } catch (err) {
      setCtxError(err instanceof Error ? err.message : String(err))
    } finally {
      setCtxRunning(false)
    }
  }

  const onSaveCtxFile = async (filePath: string, content: string): Promise<void> => {
    const filename = filePath.split(/[\\/]/).pop() ?? 'output.cpp'
    await api.commenter.saveFile({ filename, content })
  }

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

      <CppProjectBanner hint="Permet l'analyse de call-graph (callers/callees) et l'évaluation des commentaires existants par fonction." />

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
          <p className="text-sm font-medium">Glisser-déposer des fichiers C/C++</p>
          <p className="text-xs text-muted-foreground">.c .cpp .h .hpp .cxx .hxx .cc</p>
          <Button variant="outline" size="sm" type="button">Parcourir…</Button>
        </CardContent>
      </Card>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".c,.cpp,.cc,.cxx,.h,.hpp,.hxx"
        className="hidden"
        onChange={onFileInput}
      />

      {/* File list */}
      {files.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Fichiers sélectionnés ({files.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {files.map((f) => (
              <div key={f.name} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <FileCode className="size-3.5" />
                  {f.name}
                </span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => removeFile(f.name)}>
                  ✕
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Options */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Options</CardTitle>
          <CardDescription className="text-xs">
            Les règles de codage (types + nommage) sont désactivées par défaut.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {([
            ['preserveExisting', 'Préserver les commentaires existants', ''],
            ['addFileHeader', 'Ajouter l\'en-tête de fichier', ''],
            ['detailedComments', 'Commentaires détaillés', ''],
            ['applyCodingRules', 'Appliquer les règles de codage', 'Renomme les variables et convertit les types. Attention : modifie le code.']
          ] as [keyof Options, string, string][]).map(([key, label, desc]) => (
            <label key={key} className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={options[key]}
                onChange={() => toggleOption(key)}
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

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={onProcess} disabled={!files.length || processing}>
          {processing ? <><Loader2 className="mr-2 size-4 animate-spin" />Traitement…</> : 'Commenter'}
        </Button>
        {successCount > 0 && (
          <Button variant="outline" onClick={onSaveAll}>
            <FolderOpen className="mr-2 size-4" />
            Tout enregistrer ({successCount})
          </Button>
        )}
      </div>

      {progress && (
        <p className="text-sm text-muted-foreground">{progress}</p>
      )}

      {/* Results */}
      {results.length > 0 && (
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
                  {r.ok
                    ? <CheckCircle2 className="size-4 text-green-500" />
                    : <XCircle className="size-4 text-destructive" />
                  }
                  <span className={r.ok ? '' : 'text-muted-foreground line-through'}>{r.name}</span>
                  {!r.ok && <span className="text-xs text-destructive">{r.error}</span>}
                </span>
                {r.ok && (
                  <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1"
                    onClick={() => onSaveFile(r.name, r.content)}>
                    <Download className="size-3" />Enregistrer
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Pipeline contextuelle (P4) — per-function evaluation + call-graph context */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="size-4" />
            Pipeline contextuelle (évaluation par fonction)
            <label className="ml-auto flex items-center gap-2 text-xs font-normal">
              <input
                type="checkbox"
                checked={contextEnabled}
                onChange={(e) => setContextEnabled(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              Activer
            </label>
          </CardTitle>
          <CardDescription className="text-xs">
            Pour chaque fonction du fichier, l'IA évalue si le commentaire existant est suffisant. Sinon, elle en génère un nouveau en s'appuyant sur le call-graph (callers/callees BFS prof. 3) et le header associé.
          </CardDescription>
        </CardHeader>
        {contextEnabled && (
          <CardContent className="space-y-3">
            {!projectReady && (
              <div className="flex items-start gap-2 text-xs text-orange-600 dark:text-orange-400">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                <span>
                  Sélectionne d'abord la racine du projet C/C++ via le bandeau ci-dessus.
                </span>
              </div>
            )}

            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={forceAll}
                onChange={(e) => setForceAll(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <div>
                <div>Forcer la regénération sur toutes les fonctions</div>
                <div className="text-xs text-muted-foreground">Ignore le verdict de l'évaluateur (utile pour audit / réécriture de masse).</div>
              </div>
            </label>

            <Button
              onClick={onRunContextPipeline}
              disabled={!projectReady || !files.length || ctxRunning}
            >
              {ctxRunning
                ? <><Loader2 className="mr-2 size-4 animate-spin" />Évaluation en cours…</>
                : <><Sparkles className="mr-2 size-4" />Évaluer + commenter par fonction</>
              }
            </Button>

            {ctxError && (
              <div className="flex items-start gap-2 text-xs text-destructive">
                <XCircle className="size-3.5 mt-0.5" />
                <span>{ctxError}</span>
              </div>
            )}

            {ctxEvents.length > 0 && (
              <div className="rounded border bg-muted/30 p-2 text-xs font-mono max-h-40 overflow-y-auto space-y-0.5">
                {ctxEvents.map((ev, i) => (
                  <div key={i} className="text-muted-foreground">
                    {formatCtxEvent(ev)}
                  </div>
                ))}
              </div>
            )}

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
                      <span className="font-mono text-xs truncate flex-1" title={f.filePath}>
                        {f.filePath}
                      </span>
                      <Badge variant="success" className="text-[10px] gap-1">
                        <Sparkles className="size-2.5" />{f.commented}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <SkipForward className="size-2.5" />{f.skipped}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs gap-1"
                        onClick={() => void onSaveCtxFile(f.filePath, f.newContent)}
                      >
                        <Download className="size-3" />Enregistrer
                      </Button>
                    </div>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">
                        Détail par fonction ({f.plans.length})
                      </summary>
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
          </CardContent>
        )}
      </Card>
    </div>
  )
}

function formatCtxEvent(ev: CommenterContextProgress): string {
  switch (ev.type) {
    case 'index': return `→ indexation : ${ev.root}`
    case 'file-start': return `→ ${ev.filePath} (${ev.functions} fonction(s))`
    case 'evaluate': return `   • évaluation ${ev.functionName} (${ev.index}/${ev.total})`
    case 'verdict': return ev.sufficient
      ? `     ✓ suffisant — ${ev.reason}`
      : `     ✗ insuffisant — ${ev.reason}`
    case 'generate': return `     → génération du nouveau commentaire pour ${ev.functionName}`
    case 'file-done': return `→ terminé : ${ev.commented} commenté(s), ${ev.skipped} skip`
    case 'done': return '✓ pipeline contextuelle terminée'
    default: return JSON.stringify(ev)
  }
}
