import * as React from 'react'
import { useState, useEffect } from 'react'
import type { ArtifactDetail } from '@shared/types'
import { useProject } from '@renderer/stores/project.store'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { X, Pencil, Check } from 'lucide-react'

type Props = {
  detail: ArtifactDetail | null
  loading: boolean
  error: string | null
  onClose: () => void
}

function ArtifactDetailPanel({ detail, loading, error, onClose }: Props): React.JSX.Element {
  const trackerFields = useProject((s) => s.trackerFields)
  const updatingArtifact = useProject((s) => s.updatingArtifact)
  const updateArtifactError = useProject((s) => s.updateArtifactError)
  const updateArtifact = useProject((s) => s.updateArtifact)

  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editStatusId, setEditStatusId] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Reset edit state whenever a different artifact is displayed
  useEffect(() => {
    setEditing(false)
    setSaveError(null)
  }, [detail?.id])

  const startEdit = (): void => {
    if (!detail) return
    setEditTitle(detail.title ?? '')
    setEditDescription(detail.description ?? '')
    // Find the current status bind value id
    const currentStatus = detail.status
    const match = trackerFields?.statusField?.bindValues.find((v) => v.label === currentStatus)
    setEditStatusId(match?.id ?? null)
    setSaveError(null)
    setEditing(true)
  }

  const cancelEdit = (): void => {
    setEditing(false)
    setSaveError(null)
  }

  const saveEdit = async (): Promise<void> => {
    if (!detail) return
    setSaveError(null)
    try {
      await updateArtifact({
        title: editTitle.trim() || detail.title,
        description: editDescription || null,
        statusBindValueId: editStatusId
      })
      setEditing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    }
  }

  const statusOptions = trackerFields?.statusField?.bindValues ?? []

  return (
    <aside className="flex h-full w-[420px] shrink-0 flex-col border-l border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">Détail de l&apos;artéfact</h3>
        <div className="flex items-center gap-1">
          {detail && !editing && (
            <Button
              variant="ghost"
              size="icon"
              onClick={startEdit}
              aria-label="Modifier"
              title="Modifier l'artéfact"
            >
              <Pencil className="size-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
            {error}
          </div>
        )}
        {!loading && !error && !detail && (
          <p className="text-sm text-muted-foreground">Sélectionnez un artéfact dans la liste.</p>
        )}

        {detail && !editing && (
          <div className="space-y-4">
            <div>
              <p className="font-mono text-xs text-muted-foreground">#{detail.id}</p>
              <h4 className="mt-1 text-base font-semibold">{detail.title || '(sans titre)'}</h4>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {detail.status && <Badge variant="outline">{detail.status}</Badge>}
                {detail.submittedBy && <span>par {detail.submittedBy}</span>}
                {detail.submittedOn && <span>le {new Date(detail.submittedOn).toLocaleDateString()}</span>}
              </div>
            </div>

            {detail.description && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Description
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{detail.description}</p>
              </div>
            )}

            {detail.links.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Liens ({detail.links.length})
                </p>
                <ul className="mt-2 space-y-1">
                  {detail.links.map((link, i) => (
                    <li
                      key={`${link.id}-${link.direction}-${i}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Badge variant="secondary" className="font-mono">
                        #{link.id}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {link.direction === 'forward' ? '→ enfant' : '← parent'}
                        {link.type ? ` · ${link.type}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.values.length > 0 && (
              <details className="rounded-md border border-border">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Champs bruts ({detail.values.length})
                </summary>
                <div className="border-t border-border p-3">
                  <ul className="space-y-2 text-xs">
                    {detail.values.map((v) => (
                      <li key={v.fieldId}>
                        <span className="font-medium">{v.label || `field_${v.fieldId}`}</span>
                        <span className="ml-2 text-muted-foreground">[{v.type}]</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            )}
          </div>
        )}

        {detail && editing && (
          <div className="space-y-4">
            <div>
              <p className="font-mono text-xs text-muted-foreground">#{detail.id}</p>
              <p className="mb-1 mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Titre
              </p>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Titre de l'artéfact"
                className="h-8 text-sm"
              />
            </div>

            {trackerFields?.descriptionFieldId !== null && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Description
                </p>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={5}
                  placeholder="Description…"
                  className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            )}

            {statusOptions.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Statut
                </p>
                <select
                  value={editStatusId ?? ''}
                  onChange={(e) => setEditStatusId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">— inchangé —</option>
                  {statusOptions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(saveError ?? updateArtifactError) && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
                {saveError ?? updateArtifactError}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => void saveEdit()}
                disabled={updatingArtifact}
                className="flex-1"
              >
                <Check className="mr-1 size-3.5" />
                {updatingArtifact ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={cancelEdit}
                disabled={updatingArtifact}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

export default ArtifactDetailPanel
