import * as React from 'react'
import { useMemo, useState } from 'react'
import type { ArtifactSummary } from '@shared/types'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'

type Props = {
  artifacts: ArtifactSummary[]
  total: number
  offset: number
  pageSize: number
  loading: boolean
  onPage: (offset: number) => void
  onSelect: (id: number) => void
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}

function ArtifactTable({
  artifacts,
  total,
  offset,
  pageSize,
  loading,
  onPage,
  onSelect
}: Props): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  const statuses = useMemo(() => {
    const set = new Set<string>()
    for (const a of artifacts) {
      if (a.status) set.add(a.status)
    }
    return Array.from(set).sort()
  }, [artifacts])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return artifacts.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false
      if (q && !a.title.toLowerCase().includes(q) && !String(a.id).includes(q)) return false
      return true
    })
  }, [artifacts, search, statusFilter])

  const lastIndex = Math.min(offset + artifacts.length, total)
  const canPrev = offset > 0
  const canNext = offset + pageSize < total

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Rechercher (titre ou ID)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
        >
          <option value="">Tous les statuts</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 w-20">ID</th>
              <th className="px-3 py-2">Titre</th>
              <th className="px-3 py-2 w-32">Statut</th>
              <th className="px-3 py-2 w-32">Modifié</th>
              <th className="px-3 py-2 w-32">Soumis par</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Chargement…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  {artifacts.length === 0 ? 'Aucun artéfact dans ce tracker.' : 'Aucun résultat.'}
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => onSelect(a.id)}
                  className="cursor-pointer border-t border-border hover:bg-accent/50"
                >
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">#{a.id}</td>
                  <td className="px-3 py-2">{a.title || <span className="text-muted-foreground">(sans titre)</span>}</td>
                  <td className="px-3 py-2">
                    {a.status ? <Badge variant="outline">{a.status}</Badge> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                    {formatDate(a.lastModified)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{a.submittedBy ?? '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {total > 0 ? `${offset + 1}–${lastIndex} / ${total}` : '0 résultat'}
          {filtered.length !== artifacts.length && ` · ${filtered.length} après filtrage`}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!canPrev || loading} onClick={() => onPage(Math.max(0, offset - pageSize))}>
            Précédent
          </Button>
          <Button size="sm" variant="outline" disabled={!canNext || loading} onClick={() => onPage(offset + pageSize)}>
            Suivant
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ArtifactTable
