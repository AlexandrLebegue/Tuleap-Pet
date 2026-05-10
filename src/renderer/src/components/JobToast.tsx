import * as React from 'react'
import type { BackgroundJob } from '@shared/types'
import { cn } from '@renderer/lib/utils'

const STATUS_LABELS: Record<string, string> = {
  queued: 'En attente…',
  cloning: 'Clonage…',
  processing: 'Traitement…',
  committing: 'Commit…',
  pushing: 'Push…',
  'creating-pr': 'Création PR…',
  done: 'Terminé',
  error: 'Erreur',
  cancelled: 'Annulé'
}

type Props = {
  job: BackgroundJob
  onDismiss: () => void
  onCancel: () => void
}

export function JobToast({ job, onDismiss, onCancel }: Props): React.ReactElement {
  const isActive = ['queued', 'cloning', 'processing', 'committing', 'pushing', 'creating-pr'].includes(job.status)
  const isDone = job.status === 'done'
  const isError = job.status === 'error'

  React.useEffect(() => {
    if (isDone) {
      const timer = setTimeout(onDismiss, 8000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isDone, onDismiss])

  const progressPct =
    job.progress ? Math.round((job.progress.current / job.progress.total) * 100) : null

  const typeLabel = job.type === 'commentateur' ? 'Commentateur' : 'Générateur de tests'
  const typeIcon = job.type === 'commentateur' ? '💬' : '🧪'

  return (
    <div
      className={cn(
        'w-80 rounded-lg border bg-card text-card-foreground shadow-lg p-3 flex flex-col gap-2',
        isDone && 'border-green-500/50',
        isError && 'border-destructive/50'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm">{typeIcon}</span>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">{typeLabel}</p>
            <p className="text-xs text-muted-foreground truncate">
              {job.repoName} @ {job.branchName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isActive && (
            <button
              onClick={onCancel}
              className="text-xs px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground"
              title="Annuler"
            >
              ■
            </button>
          )}
          <button
            onClick={onDismiss}
            className="text-xs px-1.5 py-0.5 rounded hover:bg-muted text-muted-foreground"
            title="Fermer"
          >
            ×
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isActive && (
          <svg className="animate-spin h-3 w-3 text-primary shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        )}
        <span className={cn(
          'text-xs',
          isDone && 'text-green-600 dark:text-green-400 font-medium',
          isError && 'text-destructive font-medium'
        )}>
          {STATUS_LABELS[job.status] ?? job.status}
        </span>
      </div>

      {progressPct !== null && job.status === 'processing' && (
        <div className="space-y-1">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 rounded-full"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {job.progress!.current}/{job.progress!.total}
            {job.currentFile && ` — ${job.currentFile.split('/').pop()}`}
          </p>
        </div>
      )}

      {isError && job.error && (
        <p className="text-xs text-destructive line-clamp-2">{job.error}</p>
      )}

      {isDone && job.prUrl && (
        <a
          href={job.prUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary underline truncate"
          onClick={(e) => { e.preventDefault(); window.open(job.prUrl!) }}
        >
          Voir la Pull Request →
        </a>
      )}
      {isDone && job.branchCreated && !job.prUrl && (
        <p className="text-xs text-muted-foreground truncate">Branche: {job.branchCreated}</p>
      )}
    </div>
  )
}
