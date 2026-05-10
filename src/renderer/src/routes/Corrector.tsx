import * as React from 'react'
import { useState, useRef, useCallback } from 'react'
import { api } from '@renderer/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  Upload, FileCode, FileText, CheckCircle2, Download, FolderOpen, Loader2, ChevronDown, ChevronRight
} from 'lucide-react'

type SourceFile = { name: string; content: string }
type CorrectedFile = { name: string; content: string }
type Summary = { name: string; summary: string }

type Phase = 'idle' | 'analyzing' | 'correcting' | 'done'

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file, 'utf-8')
  })
}

const SOURCE_EXTS = ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx']
function isSourceFile(name: string): boolean {
  return SOURCE_EXTS.some((e) => name.toLowerCase().endsWith(e))
}

function SummaryPanel({ name, summary }: { name: string; summary: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="border rounded-md text-sm">
      <button
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
        <FileCode className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-medium">{name}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t bg-muted/20 whitespace-pre-wrap text-xs text-muted-foreground">
          {summary}
        </div>
      )}
    </div>
  )
}

export default function Corrector(): React.JSX.Element {
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([])
  const [errorText, setErrorText] = useState('')
  const [errorFileName, setErrorFileName] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [corrected, setCorrected] = useState<CorrectedFile[]>([])
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [draggingSource, setDraggingSource] = useState(false)
  const [draggingError, setDraggingError] = useState(false)

  const sourceInputRef = useRef<HTMLInputElement>(null)
  const errorInputRef = useRef<HTMLInputElement>(null)

  const addSourceFiles = useCallback(async (fileList: File[]) => {
    const supported = fileList.filter((f) => isSourceFile(f.name))
    const loaded = await Promise.all(
      supported.map(async (f) => ({ name: f.name, content: await readFileAsText(f) }))
    )
    setSourceFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name))
      return [...prev, ...loaded.filter((f) => !existing.has(f.name))]
    })
  }, [])

  const loadErrorFile = useCallback(async (file: File) => {
    const text = await readFileAsText(file)
    setErrorText(text)
    setErrorFileName(file.name)
  }, [])

  const onSourceDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDraggingSource(false)
    await addSourceFiles(Array.from(e.dataTransfer.files))
  }, [addSourceFiles])

  const onErrorDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDraggingError(false)
    const files = Array.from(e.dataTransfer.files)
    if (files[0]) await loadErrorFile(files[0])
  }, [loadErrorFile])

  const onSourceInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) { await addSourceFiles(Array.from(e.target.files)); e.target.value = '' }
  }, [addSourceFiles])

  const onErrorInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) { await loadErrorFile(e.target.files[0]); e.target.value = '' }
  }, [loadErrorFile])

  const removeSource = (name: string): void => setSourceFiles((p) => p.filter((f) => f.name !== name))

  const onAnalyze = async (): Promise<void> => {
    if (!errorText) return
    setPhase('analyzing')
    setStatus('Analyse des erreurs en cours…')
    setAnalysis('')
    setCorrected([])
    setSummaries([])
    try {
      const { analysis: result } = await api.corrector.analyze({ errorContent: errorText })
      setAnalysis(result)
      setStatus('')
      setPhase('idle')
    } catch (err) {
      setStatus(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
      setPhase('idle')
    }
  }

  const onCorrect = async (): Promise<void> => {
    if (!sourceFiles.length || !errorText || !analysis) return
    setPhase('correcting')
    setStatus(`Correction de ${sourceFiles.length} fichier(s)…`)
    setCorrected([])
    setSummaries([])
    try {
      const result = await api.corrector.correct({ files: sourceFiles, errorContent: errorText, analysis })
      setCorrected(result.corrected)
      setSummaries(result.summaries)
      setStatus('')
      setPhase('done')
    } catch (err) {
      setStatus(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
      setPhase('idle')
    }
  }

  const onSaveFile = async (name: string, content: string): Promise<void> => {
    await api.corrector.saveFile({ filename: name, content })
  }

  const onSaveAll = async (): Promise<void> => {
    if (!corrected.length) return
    await api.corrector.saveAll({ files: corrected })
  }

  const isLoading = phase === 'analyzing' || phase === 'correcting'
  const canAnalyze = !!errorText && !isLoading
  const canCorrect = !!sourceFiles.length && !!errorText && !!analysis && !isLoading

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-lg font-semibold">Correcteur d'erreurs</h1>
        <p className="text-sm text-muted-foreground">
          Analyse les erreurs de compilation et corrige automatiquement les fichiers C/C++.
        </p>
      </div>

      {/* Source files drop zone */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1.5">Fichiers sources C/C++</p>
        <Card
          className={`border-2 border-dashed transition-colors cursor-pointer ${draggingSource ? 'border-primary bg-primary/5' : 'border-border'}`}
          onDrop={onSourceDrop}
          onDragOver={(e) => { e.preventDefault(); setDraggingSource(true) }}
          onDragLeave={() => setDraggingSource(false)}
          onClick={() => sourceInputRef.current?.click()}
        >
          <CardContent className="flex flex-col items-center justify-center gap-2 py-6">
            <Upload className="size-6 text-muted-foreground" />
            <p className="text-sm">Glisser-déposer des fichiers C/C++</p>
            <Button variant="outline" size="sm" type="button">Parcourir…</Button>
          </CardContent>
        </Card>
        <input ref={sourceInputRef} type="file" multiple accept=".c,.cpp,.cc,.cxx,.h,.hpp,.hxx" className="hidden" onChange={onSourceInput} />
      </div>

      {sourceFiles.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sources ({sourceFiles.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {sourceFiles.map((f) => (
              <div key={f.name} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <FileCode className="size-3.5" />{f.name}
                </span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => removeSource(f.name)}>✕</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Error file drop zone */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1.5">Fichier d'erreurs de compilation</p>
        <Card
          className={`border-2 border-dashed transition-colors cursor-pointer ${draggingError ? 'border-primary bg-primary/5' : 'border-border'}`}
          onDrop={onErrorDrop}
          onDragOver={(e) => { e.preventDefault(); setDraggingError(true) }}
          onDragLeave={() => setDraggingError(false)}
          onClick={() => errorInputRef.current?.click()}
        >
          <CardContent className="flex flex-col items-center justify-center gap-2 py-6">
            <FileText className="size-6 text-muted-foreground" />
            {errorFileName
              ? <p className="text-sm font-medium text-primary">{errorFileName} chargé</p>
              : <p className="text-sm">Glisser-déposer le fichier d'erreurs (.txt, .log…)</p>
            }
            <Button variant="outline" size="sm" type="button">
              {errorFileName ? 'Changer…' : 'Parcourir…'}
            </Button>
          </CardContent>
        </Card>
        <input ref={errorInputRef} type="file" accept=".txt,.log,.err,*" className="hidden" onChange={onErrorInput} />
      </div>

      {/* Paste fallback */}
      {!errorFileName && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Ou coller les erreurs directement</p>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono min-h-[100px] resize-y focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Coller ici les messages d'erreur de compilation…"
            value={errorText}
            onChange={(e) => setErrorText(e.target.value)}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={onAnalyze} disabled={!canAnalyze} variant="outline">
          {phase === 'analyzing' ? <><Loader2 className="mr-2 size-4 animate-spin" />Analyse…</> : 'Analyser les erreurs'}
        </Button>
        <Button onClick={onCorrect} disabled={!canCorrect}>
          {phase === 'correcting' ? <><Loader2 className="mr-2 size-4 animate-spin" />Correction…</> : 'Corriger les fichiers'}
        </Button>
        {corrected.length > 0 && (
          <Button variant="outline" onClick={onSaveAll}>
            <FolderOpen className="mr-2 size-4" />Tout enregistrer ({corrected.length})
          </Button>
        )}
      </div>

      {status && <p className="text-sm text-muted-foreground">{status}</p>}

      {/* Analysis result */}
      {analysis && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Analyse des erreurs
              <Badge variant="outline" className="text-xs">Étape 1/2</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
              {analysis}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Corrected files */}
      {corrected.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Fichiers corrigés
              <Badge variant="success">{corrected.length} fichier(s)</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {corrected.map((f) => (
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

      {/* Summaries */}
      {summaries.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Résumés des corrections</p>
          <div className="space-y-2">
            {summaries.map((s) => (
              <SummaryPanel key={s.name} name={s.name} summary={s.summary} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
