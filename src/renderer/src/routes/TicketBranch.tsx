import * as React from 'react'
import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'

export default function TicketBranch(): React.JSX.Element {
  const [artifactId, setArtifactId] = useState('')
  const [repoPath, setRepoPath] = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [branchPrefix, setBranchPrefix] = useState('feature')
  const [pushImmediately, setPushImmediately] = useState(false)
  const [postComment, setPostComment] = useState(true)
  const [preview, setPreview] = useState<{
    branchName: string
    commitMessage: string
    prBody: string
    contextMarkdown: string
  } | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        <div>
          <Label>Artifact ID Tuleap</Label>
          <Input value={artifactId} onChange={(e) => setArtifactId(e.target.value)} placeholder="ex: 1234" />
        </div>
        <div>
          <Label>Préfixe de branche</Label>
          <Input value={branchPrefix} onChange={(e) => setBranchPrefix(e.target.value)} />
        </div>
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
            <div key={i} className="font-mono text-xs">
              {l}
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
