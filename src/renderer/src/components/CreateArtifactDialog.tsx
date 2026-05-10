import * as React from 'react'
import { useState, useEffect } from 'react'
import type { TrackerFields } from '@shared/types'
import { useProject } from '@renderer/stores/project.store'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

type Props = {
  open: boolean
  onClose: () => void
  trackerFields: TrackerFields
  defaultStatusBindValueId: number | null
}

export default function CreateArtifactDialog({
  open,
  onClose,
  trackerFields,
  defaultStatusBindValueId
}: Props): React.JSX.Element | null {
  const createArtifact = useProject((s) => s.createArtifact)
  const createArtifactError = useProject((s) => s.createArtifactError)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [statusId, setStatusId] = useState<number | null>(defaultStatusBindValueId)
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTitle('')
      setDescription('')
      setStatusId(defaultStatusBindValueId)
      setLocalError(null)
    }
  }, [open, defaultStatusBindValueId])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!title.trim()) {
      setLocalError('Le titre est requis.')
      return
    }
    setSubmitting(true)
    setLocalError(null)
    try {
      await createArtifact(title.trim(), description.trim() || null, statusId)
      onClose()
    } catch {
      setLocalError(createArtifactError ?? 'Erreur lors de la création.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg border bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Nouvel artéfact</h2>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="artifact-title">Titre *</Label>
            <Input
              id="artifact-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre de l'artéfact"
              autoFocus
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="artifact-description">Description</Label>
            <textarea
              id="artifact-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optionnelle)"
              rows={3}
              disabled={submitting}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>

          {trackerFields.statusField && (
            <div className="space-y-1.5">
              <Label htmlFor="artifact-status">Statut</Label>
              <select
                id="artifact-status"
                value={statusId ?? ''}
                onChange={(e) => setStatusId(e.target.value ? Number(e.target.value) : null)}
                disabled={submitting}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">— Aucun statut —</option>
                {trackerFields.statusField.bindValues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(localError ?? createArtifactError) && (
            <p className="text-sm text-destructive">
              {localError ?? createArtifactError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting || !title.trim()}>
              {submitting ? 'Création…' : 'Créer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
