import * as React from 'react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSettings } from '@renderer/stores/settings.store'
import { useProject, PROJECT_PAGE_SIZE } from '@renderer/stores/project.store'
import { Card, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import TrackerList from '@renderer/components/TrackerList'
import ArtifactTable from '@renderer/components/ArtifactTable'
import ArtifactDetailPanel from '@renderer/components/ArtifactDetailPanel'
import KanbanBoard from '@renderer/components/KanbanBoard'

function Project(): React.JSX.Element {
  const config = useSettings((s) => s.config)
  const projects = useSettings((s) => s.projects)
  const trackers = useProject((s) => s.trackers)
  const loadingTrackers = useProject((s) => s.loadingTrackers)
  const trackersError = useProject((s) => s.trackersError)
  const selectedTrackerId = useProject((s) => s.selectedTrackerId)
  const artifacts = useProject((s) => s.artifacts)
  const artifactsTotal = useProject((s) => s.artifactsTotal)
  const artifactsOffset = useProject((s) => s.artifactsOffset)
  const loadingArtifacts = useProject((s) => s.loadingArtifacts)
  const artifactsError = useProject((s) => s.artifactsError)
  const artifactDetail = useProject((s) => s.artifactDetail)
  const loadingDetail = useProject((s) => s.loadingDetail)
  const detailError = useProject((s) => s.detailError)
  const viewMode = useProject((s) => s.viewMode)
  const trackerFields = useProject((s) => s.trackerFields)
  const loadingFields = useProject((s) => s.loadingFields)

  const loadTrackers = useProject((s) => s.loadTrackers)
  const selectTracker = useProject((s) => s.selectTracker)
  const loadArtifacts = useProject((s) => s.loadArtifacts)
  const openArtifact = useProject((s) => s.openArtifact)
  const closeArtifact = useProject((s) => s.closeArtifact)
  const setViewMode = useProject((s) => s.setViewMode)

  const projectName = projects.find((p) => p.id === config.projectId)?.label ?? null

  useEffect(() => {
    if (config.projectId !== null && trackers.length === 0 && !loadingTrackers && !trackersError) {
      void loadTrackers()
    }
  }, [config.projectId, trackers.length, loadingTrackers, trackersError, loadTrackers])

  if (!config.tuleapUrl || !config.hasToken) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h2 className="text-2xl font-semibold tracking-tight">Projet</h2>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Connexion requise</CardTitle>
            <CardDescription>
              Configurez d&apos;abord l&apos;URL et le token dans <Link to="/settings" className="underline">Réglages</Link>.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (config.projectId === null) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h2 className="text-2xl font-semibold tracking-tight">Projet</h2>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Aucun projet sélectionné</CardTitle>
            <CardDescription>
              Choisissez un projet dans <Link to="/settings" className="underline">Réglages</Link> pour parcourir ses
              trackers et artéfacts.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl space-y-6 px-8 py-8">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                {projectName ?? `Projet #${config.projectId}`}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Trackers du projet et exploration des artéfacts.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => loadTrackers()} disabled={loadingTrackers}>
              {loadingTrackers ? 'Rechargement…' : 'Rafraîchir'}
            </Button>
          </div>

          {trackersError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
              {trackersError}
            </div>
          )}

          {trackers.length === 0 && !loadingTrackers && !trackersError && (
            <p className="text-sm text-muted-foreground">Aucun tracker dans ce projet.</p>
          )}

          {trackers.length > 0 && (
            <TrackerList
              trackers={trackers}
              selectedId={selectedTrackerId}
              onSelect={(id) => selectTracker(id)}
            />
          )}

          {selectedTrackerId !== null && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium tracking-tight">Artéfacts</h3>
                <div className="flex gap-1">
                  <Button
                    variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('table')}
                    title="Vue tableau"
                  >
                    ☰ Tableau
                  </Button>
                  <Button
                    variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('kanban')}
                    disabled={loadingFields && trackerFields === null}
                    title="Vue kanban"
                  >
                    ⊞ Kanban
                  </Button>
                </div>
              </div>

              {viewMode === 'table' && (
                <>
                  {artifactsError && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
                      {artifactsError}
                    </div>
                  )}
                  <ArtifactTable
                    artifacts={artifacts}
                    total={artifactsTotal}
                    offset={artifactsOffset}
                    pageSize={PROJECT_PAGE_SIZE}
                    loading={loadingArtifacts}
                    onPage={(offset) => loadArtifacts(offset)}
                    onSelect={(id) => openArtifact(id)}
                  />
                </>
              )}

              {viewMode === 'kanban' && (
                <>
                  {(loadingFields && trackerFields === null) ? (
                    <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                      Chargement de la structure du tracker…
                    </div>
                  ) : trackerFields !== null ? (
                    <KanbanBoard
                      trackerFields={trackerFields}
                      onCardClick={(id) => openArtifact(id)}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Impossible de charger la structure du tracker.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {(artifactDetail !== null || loadingDetail || detailError) && (
        <ArtifactDetailPanel
          detail={artifactDetail}
          loading={loadingDetail}
          error={detailError}
          onClose={closeArtifact}
        />
      )}
    </div>
  )
}

export default Project
