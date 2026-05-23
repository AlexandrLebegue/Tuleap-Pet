import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { useSettings } from '@renderer/stores/settings.store'
import type { GitRepository } from '@shared/types'

type ArtifactHit = { id: number; title: string; trackerId: number | null }

// ── Artifact search combobox ────────────────────────────────────────────────

function ArtifactSearch({
  value,
  onChange
}: {
  value: string
  onChange: (id: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<ArtifactHit[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Keep local query in sync when parent sets value externally (URL param)
  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const q = query.trim()
    if (!q) { setResults([]); return }
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const hits = await window.api.ticketBranch.searchArtifacts(q)
        setResults(hits)
        setOpen(hits.length > 0)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function select(hit: ArtifactHit): void {
    setQuery(`${hit.id} — ${hit.title}`)
    onChange(String(hit.id))
    setOpen(false)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const v = e.target.value
    setQuery(v)
    // If user types a plain number, propagate it immediately
    const num = Number.parseInt(v.trim(), 10)
    if (Number.isFinite(num) && String(num) === v.trim()) {
      onChange(v.trim())
    } else {
      onChange('')
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={query}
        onChange={handleInputChange}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Chercher ou saisir l'ID (ex: 1234 ou 'login')"
      />
      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">…</span>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {results.map((hit) => (
            <button
              key={hit.id}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => select(hit)}
            >
              <code className="shrink-0 text-xs text-muted-foreground">#{hit.id}</code>
              <span className="truncate">{hit.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function TicketBranch(): React.JSX.Element {
  const [searchParams] = useSearchParams()
  const config = useSettings((s) => s.config)

  const [artifactId, setArtifactId] = useState(searchParams.get('artifactId') ?? '')
  const [repoPath, setRepoPath] = useState(config.tempClonePath ?? '')
  const [baseBranch, setBaseBranch] = useState('main')
  const [branchPrefix, setBranchPrefix] = useState('feature')
  const [pushImmediately, setPushImmediately] = useState(false)
  const [postComment, setPostComment] = useState(true)

  // Tuleap repo selector
  const [tuleapRepos, setTuleapRepos] = useState<GitRepository[]>([])
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null)
  const [cloning, setCloning] = useState(false)
  const [cloneError, setCloneError] = useState<string | null>(null)

  const [preview, setPreview] = useState<{
    branchName: string
    commitMessage: string
    prBody: string
    contextMarkdown: string
  } | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pre-fill repoPath from config whenever tempClonePath changes (e.g. on first load)
  useEffect(() => {
    if (config.tempClonePath && !repoPath) setRepoPath(config.tempClonePath)
  }, [config.tempClonePath, repoPath])

  // Load Tuleap repos for the clone selector
  useEffect(() => {
    window.api.gitExplorer.listRepos().then(setTuleapRepos).catch(() => {})
  }, [])

  async function cloneTuleapRepo(): Promise<void> {
    const repo = tuleapRepos.find((r) => r.id === selectedRepoId)
    if (!repo) return
    setCloning(true)
    setCloneError(null)
    try {
      const result = await window.api.ticketBranch.cloneRepo({
        repoName: repo.name,
        cloneUrl: repo.cloneUrl
      })
      if (!result.ok) throw new Error(result.error)
      setRepoPath(result.path)
    } catch (e) {
      setCloneError(e instanceof Error ? e.message : String(e))
    } finally {
      setCloning(false)
    }
  }

  async function doPreview(): Promise<void> {
    setError(null)
    setBusy(true)
    try {
      const id = Number.parseInt(artifactId, 10)
      if (!Number.isFinite(id)) throw new Error('Artifact ID invalide')
      const r = await window.api.ticketBranch.preview({ artifactId: id })
      if (!r.ok) throw new Error(r.error)
      setPreview({
        branchName: r.branchName,
        commitMessage: r.commitMessage,
        prBody: r.prBody,
        contextMarkdown: r.contextMarkdown
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function pickRepo(): Promise<void> {
    const result = await window.api.ticketBranch.chooseRepo()
    if (result.ok) setRepoPath(result.path)
  }

  async function execute(): Promise<void> {
    if (!preview || !repoPath) return
    setError(null)
    setBusy(true)
    setLog([])
    try {
      const id = Number.parseInt(artifactId, 10)
      const result = await window.api.ticketBranch.execute({
        artifactId: id,
        repoPath,
        baseBranch,
        branchPrefix,
        pushImmediately,
        postComment
      })
      if (!result.ok) throw new Error(result.error)
      setLog([
        `✓ Branche créée : ${result.branchName}`,
        result.pushed ? '✓ Branche poussée' : '… non poussée (option désactivée)',
        postComment ? '✓ Commentaire posté sur Tuleap' : ''
      ].filter(Boolean))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header>
        <h1 className="text-xl font-semibold">Démarrer le dev d&apos;un ticket</h1>
        <p className="text-sm text-muted-foreground">
          Crée une branche git nommée d&apos;après l&apos;artéfact Tuleap, scaffold le message de commit et le corps de PR.
        </p>
      </header>

      <Card className="grid grid-cols-2 gap-3 p-4">
        {/* Artifact search */}
        <div className="col-span-2">
          <Label>Artéfact Tuleap</Label>
          <ArtifactSearch value={artifactId ? `${artifactId}` : ''} onChange={setArtifactId} />
        </div>

        {/* Tuleap repo selector + clone */}
        <div className="col-span-2">
          <Label>Dépôt Git (cloner depuis Tuleap)</Label>
          <div className="flex gap-2">
            <select
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              value={selectedRepoId ?? ''}
              onChange={(e) => setSelectedRepoId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— choisir un dépôt Tuleap —</option>
              {tuleapRepos.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <Button
              variant="outline"
              onClick={cloneTuleapRepo}
              disabled={!selectedRepoId || cloning || !config.tempClonePath}
              title={!config.tempClonePath ? 'Configurez un chemin de clonage dans les Paramètres' : undefined}
            >
              {cloning ? 'Clone…' : 'Cloner ici'}
            </Button>
          </div>
          {cloneError && <p className="mt-1 text-xs text-destructive">{cloneError}</p>}
          {!config.tempClonePath && (
            <p className="mt-1 text-xs text-muted-foreground">
              Configurez le chemin de clonage dans Paramètres → Dossier temporaire.
            </p>
          )}
        </div>

        {/* Repo path (manual or from clone) */}
        <div className="col-span-2">
          <Label>Chemin du dépôt local</Label>
          <div className="flex gap-2">
            <Input value={repoPath} onChange={(e) => setRepoPath(e.target.value)} placeholder="/path/to/repo" />
            <Button variant="outline" onClick={pickRepo} type="button">Parcourir…</Button>
          </div>
        </div>

        <div>
          <Label>Branche de base</Label>
          <Input value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} />
        </div>
        <div>
          <Label>Préfixe de branche</Label>
          <Input value={branchPrefix} onChange={(e) => setBranchPrefix(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1 self-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pushImmediately} onChange={(e) => setPushImmediately(e.target.checked)} />
            Pousser la branche immédiatement
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={postComment} onChange={(e) => setPostComment(e.target.checked)} />
            Poster un commentaire sur l&apos;artéfact
          </label>
        </div>

        <div className="col-span-2 flex gap-2">
          <Button onClick={doPreview} disabled={busy || !artifactId}>Aperçu</Button>
          <Button onClick={execute} disabled={busy || !preview || !repoPath} variant="default">
            Exécuter
          </Button>
        </div>
      </Card>

      {error && <Card className="border-destructive p-3 text-sm text-destructive">{error}</Card>}

      {preview && (
        <Card className="p-4 text-sm">
          <h2 className="mb-2 font-semibold">Aperçu</h2>
          <p><strong>Branche :</strong> <code>{preview.branchName}</code></p>
          <p><strong>Commit :</strong> <code>{preview.commitMessage}</code></p>
          <details className="mt-2">
            <summary className="cursor-pointer text-muted-foreground">Corps PR (draft)</summary>
            <pre className="mt-2 max-h-48 overflow-y-auto rounded bg-muted p-2 text-xs">{preview.prBody}</pre>
          </details>
          <details className="mt-2">
            <summary className="cursor-pointer text-muted-foreground">Contexte Markdown ticket</summary>
            <pre className="mt-2 max-h-48 overflow-y-auto rounded bg-muted p-2 text-xs">{preview.contextMarkdown}</pre>
          </details>
        </Card>
      )}

      {log.length > 0 && (
        <Card className="p-4 text-sm">
          <h2 className="mb-2 font-semibold">Exécution</h2>
          {log.map((l, i) => (
            <div key={i} className="font-mono text-xs">{l}</div>
          ))}
        </Card>
      )}
    </div>
  )
}
