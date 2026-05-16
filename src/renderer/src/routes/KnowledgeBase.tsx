import * as React from 'react'
import { useEffect, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'

type Hit = { id: number; title: string; status: string | null; snippet: string; trackerId: number | null }

export default function KnowledgeBase(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [indexing, setIndexing] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [indexResult, setIndexResult] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const unsubscribe = window.api.rag.subscribeProgress(setProgress)
    return unsubscribe
  }, [])

  async function doIndex(): Promise<void> {
    setIndexing(true)
    setIndexResult(null)
    setProgress(null)
    try {
      const r = await window.api.rag.index()
      if (r.ok) setIndexResult(`✓ ${r.indexed} artéfacts indexés, ${r.skipped} ignorés.`)
      else setIndexResult(`Erreur : ${r.error}`)
    } finally {
      setIndexing(false)
    }
  }

  async function doSearch(): Promise<void> {
    setSearching(true)
    try {
      const result = await window.api.rag.search({ query, limit: 12 })
      setHits(result)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header>
        <h1 className="text-xl font-semibold">Knowledge Base</h1>
        <p className="text-sm text-muted-foreground">
          Recherche full-text sur les artéfacts Tuleap fermés du projet courant. Indexe d&apos;abord, puis interroge.
        </p>
      </header>

      <Card className="flex items-center gap-2 p-4">
        <Button onClick={doIndex} disabled={indexing}>
          {indexing ? 'Indexation…' : 'Indexer les artéfacts fermés'}
        </Button>
        {progress && (
          <span className="text-xs text-muted-foreground">
            {progress.done} / {progress.total || '?'}
          </span>
        )}
        {indexResult && <span className="text-xs">{indexResult}</span>}
      </Card>

      <Card className="flex items-center gap-2 p-4">
        <Input
          placeholder="ex: bug auth, refactor login, perf db…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void doSearch()}
        />
        <Button onClick={doSearch} disabled={searching || query.trim().length === 0}>
          {searching ? '…' : 'Rechercher'}
        </Button>
      </Card>

      {hits.length > 0 ? (
        <ul className="space-y-2">
          {hits.map((h) => (
            <Card key={h.id} className="p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">#{h.id}</span>
                <span className="font-medium">{h.title}</span>
                {h.status && <Badge variant="outline">{h.status}</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground" dangerouslySetInnerHTML={{ __html: h.snippet }} />
            </Card>
          ))}
        </ul>
      ) : (
        query && !searching && <p className="text-sm text-muted-foreground">Aucun résultat.</p>
      )}
    </div>
  )
}
