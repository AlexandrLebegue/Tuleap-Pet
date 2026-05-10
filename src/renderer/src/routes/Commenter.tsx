import * as React from 'react'
import { useState, useRef, useCallback } from 'react'
import { api } from '@renderer/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Upload, FileCode, CheckCircle2, XCircle, Download, FolderOpen, Loader2 } from 'lucide-react'

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
    </div>
  )
}
