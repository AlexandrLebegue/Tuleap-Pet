import * as React from 'react'
import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'

type Entry = { commit: string; author: string; date: string; message: string; artifactIds: number[] }
type Resolved = { id: number; title: string; status: string | null }

export default function Traceability(): React.JSX.Element {
  const [repoPath, setRepoPath] = useState('')
  const [filePath, setFilePath] = useState('')
  const [refRegex, setRefRegex] = useState('#(\\d{2,7})|art-(\\d{2,7})|\\[TLP-(\\d{2,7})\\]')
  const [entries, setEntries] = useState<Entry[]>([])
  const [resolved, setResolved] = useState<Resolved[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pickRepo(): Promise<void> {
    const r = await window.api.ticketBranch.chooseRepo()
    if (r.ok) setRepoPath(r.path)
  }

  async function fetchHistory(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const r = await window.api.traceability.fileHistory({ repoPath, filePath, refRegex, limit: 50 })
      if (!r.ok) throw new Error(r.error)
      setEntries(r.entries)
      setResolved(r.resolvedArtifacts)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const resolvedById = new Map(resolved.map((a) => [a.id, a]))

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header>
        <h1 className="text-xl font-semibold">Code → Tuleap Traceability</h1>
        <p className="text-sm text-muted-foreground">
          Sélectionne un fichier dans un dépôt, on récupère son git log et on résout chaque référence d&apos;artéfact mentionnée.
        </p>
      </header>

      <Card className="grid grid-cols-2 gap-3 p-4">
        <div className="col-span-2">
          <Label>Dépôt</Label>
          <div className="flex gap-2">
            <Input value={repoPath} onChange={(e) => setRepoPath(e.target.value)} />
            <Button variant="outline" onClick={pickRepo}>Parcourir…</Button>
          </div>
        </div>
        <div className="col-span-2">
          <Label>Fichier (relatif au dépôt)</Label>
          <Input value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="src/foo/bar.ts" />
        </div>
        <div className="col-span-2">
          <Label>Regex de référence d&apos;artéfact</Label>
          <Input value={refRegex} onChange={(e) => setRefRegex(e.target.value)} className="font-mono text-xs" />
        </div>
        <div className="col-span-2">
          <Button onClick={fetchHistory} disabled={busy || !repoPath || !filePath}>
            {busy ? 'Recherche…' : 'Récupérer l\'historique'}
          </Button>
        </div>
      </Card>

      {error && <Card className="border-destructive p-3 text-sm text-destructive">{error}</Card>}

      {entries.length > 0 && (
        <div className="grid grid-cols-[1fr_280px] gap-4">
          <Card className="overflow-hidden">
            <h2 className="border-b px-3 py-2 text-sm font-semibold">Commits ({entries.length})</h2>
            <ul className="divide-y text-sm">
              {entries.map((e, i) => (
                <li key={i} className="p-2">
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-muted-foreground">{e.commit}</code>
                    <span className="font-medium">{e.message}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <span>{e.author}</span>
                    <span>·</span>
                    <span>{e.date.slice(0, 10)}</span>
                    {e.artifactIds.map((id) => (
                      <Badge key={id} variant="outline" className="ml-1">
                        #{id}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-3">
            <h2 className="mb-2 text-sm font-semibold">Artéfacts résolus ({resolved.length})</h2>
            <ul className="space-y-1 text-xs">
              {[...resolvedById.values()].map((a) => (
                <li key={a.id} className="flex items-center gap-1">
                  <code>#{a.id}</code>
                  <span className="truncate">{a.title}</span>
                  {a.status && <Badge variant="outline" className="ml-auto">{a.status}</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  )
}
