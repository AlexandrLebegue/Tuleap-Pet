import * as React from 'react'
import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'

export default function ReleaseNotes(): React.JSX.Element {
  const [repoPath, setRepoPath] = useState('')
  const [fromRef, setFromRef] = useState('')
  const [toRef, setToRef] = useState('HEAD')
  const [tags, setTags] = useState<string[]>([])
  const [markdown, setMarkdown] = useState('')
  const [meta, setMeta] = useState<{ commitCount: number; artifactIdsResolved: number[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pickRepo(): Promise<void> {
    const r = await window.api.ticketBranch.chooseRepo()
    if (r.ok) {
      setRepoPath(r.path)
      const ts = await window.api.releaseNotes.listTags(r.path)
      setTags(ts)
      if (ts.length >= 1 && !fromRef) setFromRef(ts[0]!)
    }
  }

  async function generate(): Promise<void> {
    setBusy(true)
    setError(null)
    setMarkdown('')
    try {
      const r = await window.api.releaseNotes.generate({ repoPath, fromRef, toRef })
      if (!r.ok) throw new Error(r.error)
      setMarkdown(r.markdown)
      setMeta({ commitCount: r.commitCount, artifactIdsResolved: r.artifactIdsResolved })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function copyToClipboard(): void {
    void navigator.clipboard.writeText(markdown)
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header>
        <h1 className="text-xl font-semibold">Release Notes</h1>
        <p className="text-sm text-muted-foreground">
          Croise git log + artéfacts Tuleap entre deux tags pour produire un changelog en Markdown.
        </p>
      </header>

      <Card className="grid grid-cols-2 gap-3 p-4">
        <div className="col-span-2">
          <Label>Dépôt local</Label>
          <div className="flex gap-2">
            <Input value={repoPath} onChange={(e) => setRepoPath(e.target.value)} />
            <Button variant="outline" onClick={pickRepo}>Parcourir…</Button>
          </div>
        </div>
        <div>
          <Label>Depuis (tag ou ref)</Label>
          <Input value={fromRef} onChange={(e) => setFromRef(e.target.value)} list="release-tags" placeholder="v1.0.0" />
        </div>
        <div>
          <Label>Jusqu&apos;à</Label>
          <Input value={toRef} onChange={(e) => setToRef(e.target.value)} list="release-tags" />
        </div>
        <datalist id="release-tags">
          {tags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <div className="col-span-2">
          <Button onClick={generate} disabled={busy || !repoPath || !fromRef || !toRef}>
            {busy ? 'Génération…' : 'Générer'}
          </Button>
        </div>
      </Card>

      {error && <Card className="border-destructive p-3 text-sm text-destructive">{error}</Card>}

      {markdown && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-semibold">Changelog généré</h2>
            {meta && (
              <span className="text-xs text-muted-foreground">
                {meta.commitCount} commits · {meta.artifactIdsResolved.length} artéfacts
              </span>
            )}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={copyToClipboard}>
              Copier
            </Button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{markdown}</pre>
        </Card>
      )}
    </div>
  )
}
