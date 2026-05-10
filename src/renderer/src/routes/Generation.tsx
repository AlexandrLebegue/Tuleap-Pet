import * as React from 'react'
import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useSettings } from '@renderer/stores/settings.store'
import { useGeneration } from '@renderer/stores/generation.store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Label } from '@renderer/components/ui/label'
import { Input } from '@renderer/components/ui/input'
import MarpPreviewFrame from '@renderer/components/MarpPreviewFrame'

function formatTokens(usage: { totalTokens?: number; inputTokens?: number; outputTokens?: number } | null): string {
  if (!usage) return ''
  if (typeof usage.totalTokens === 'number') return `${usage.totalTokens} tokens`
  const i = usage.inputTokens ?? 0
  const o = usage.outputTokens ?? 0
  return `${i + o} tokens`
}

function ProgressBar({ done, total }: { done: number; total: number }): React.JSX.Element | null {
  if (total === 0) return null
  const pct = Math.round((done / total) * 100)
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function Generation(): React.JSX.Element {
  const config = useSettings((s) => s.config)

  const mode = useGeneration((s) => s.mode)
  const setMode = useGeneration((s) => s.setMode)

  // Sprint mode
  const sprints = useGeneration((s) => s.sprints)
  const loadingSprints = useGeneration((s) => s.loadingSprints)
  const sprintsError = useGeneration((s) => s.sprintsError)
  const statusFilter = useGeneration((s) => s.statusFilter)
  const selectedSprintId = useGeneration((s) => s.selectedSprintId)
  const sprintContent = useGeneration((s) => s.sprintContent)
  const loadingContent = useGeneration((s) => s.loadingContent)
  const contentError = useGeneration((s) => s.contentError)

  // Custom mode
  const trackers = useGeneration((s) => s.trackers)
  const loadingTrackers = useGeneration((s) => s.loadingTrackers)
  const selectedTrackerId = useGeneration((s) => s.selectedTrackerId)
  const trackerArtifacts = useGeneration((s) => s.trackerArtifacts)
  const loadingTrackerArtifacts = useGeneration((s) => s.loadingTrackerArtifacts)
  const selectedArtifactIds = useGeneration((s) => s.selectedArtifactIds)
  const customLabel = useGeneration((s) => s.customLabel)

  // Generation
  const generationStatus = useGeneration((s) => s.generationStatus)
  const generationError = useGeneration((s) => s.generationError)
  const markdown = useGeneration((s) => s.markdown)
  const modelUsed = useGeneration((s) => s.modelUsed)
  const usage = useGeneration((s) => s.usage)
  const slideWarnings = useGeneration((s) => s.slideWarnings)

  // Progress
  const currentProgressLabel = useGeneration((s) => s.currentProgressLabel)
  const slidesDone = useGeneration((s) => s.slidesDone)
  const slidesTotal = useGeneration((s) => s.slidesTotal)

  // Preview / Export
  const previewHtml = useGeneration((s) => s.previewHtml)
  const previewError = useGeneration((s) => s.previewError)
  const exportStatus = useGeneration((s) => s.exportStatus)
  const exportError = useGeneration((s) => s.exportError)
  const exportPath = useGeneration((s) => s.exportPath)

  const loadSprints = useGeneration((s) => s.loadSprints)
  const selectSprint = useGeneration((s) => s.selectSprint)
  const loadTrackers = useGeneration((s) => s.loadTrackers)
  const selectTracker = useGeneration((s) => s.selectTracker)
  const dateFrom = useGeneration((s) => s.dateFrom)
  const dateTo = useGeneration((s) => s.dateTo)

  const toggleArtifact = useGeneration((s) => s.toggleArtifact)
  const clearArtifactSelection = useGeneration((s) => s.clearArtifactSelection)
  const setCustomLabel = useGeneration((s) => s.setCustomLabel)
  const setDateFrom = useGeneration((s) => s.setDateFrom)
  const setDateTo = useGeneration((s) => s.setDateTo)
  const generate = useGeneration((s) => s.generate)
  const setMarkdown = useGeneration((s) => s.setMarkdown)
  const refreshPreview = useGeneration((s) => s.refreshPreview)
  const exportPptx = useGeneration((s) => s.exportPptx)

  const llmReady =
    config.llmProvider === 'local'
      ? Boolean(config.localBaseUrl && config.localModel)
      : config.hasLlmKey
  const ready = config.tuleapUrl && config.hasToken && config.projectId !== null && llmReady

  useEffect(() => {
    if (!ready) return
    if (sprints.length === 0 && !loadingSprints && !sprintsError) {
      void loadSprints('open')
    }
  }, [ready, sprints.length, loadingSprints, sprintsError, loadSprints])

  const selectedSprint = useMemo(
    () => sprints.find((s) => s.id === selectedSprintId) ?? null,
    [sprints, selectedSprintId]
  )

  const isGenerating = ['enriching', 'summarizing', 'generating'].includes(generationStatus)

  const canGenerate =
    !isGenerating &&
    (mode === 'sprint' ? selectedSprintId !== null : selectedArtifactIds.length > 0)

  if (!ready) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h2 className="text-2xl font-semibold tracking-tight">Génération IA</h2>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Configuration requise</CardTitle>
            <CardDescription>
              Renseignez Tuleap, un projet ET la clé OpenRouter dans{' '}
              <Link to="/settings" className="underline">
                Réglages
              </Link>{' '}
              avant de générer un sprint review.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-8 py-8">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Génération IA</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Générez des slides Marp slide par slide, depuis un sprint ou une sélection d&apos;artefacts.
          </p>
        </div>
        <Badge variant="outline">Phase 1</Badge>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <Button
          variant={mode === 'sprint' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('sprint')}
        >
          Sprint
        </Button>
        <Button
          variant={mode === 'custom' ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setMode('custom')
            if (trackers.length === 0 && !loadingTrackers) void loadTrackers()
          }}
        >
          Artefacts personnalisés
        </Button>
      </div>

      {/* Sprint mode */}
      {mode === 'sprint' && (
        <Card>
          <CardHeader>
            <CardTitle>Sprint</CardTitle>
            <CardDescription>Sélectionnez un milestone du projet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="sprint-status" className="text-xs">
                Statut
              </Label>
              <select
                id="sprint-status"
                value={statusFilter}
                onChange={(e) => loadSprints(e.target.value as 'open' | 'closed' | 'all')}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="open">Ouverts</option>
                <option value="closed">Clos</option>
                <option value="all">Tous</option>
              </select>
              <Button size="sm" variant="outline" onClick={() => loadSprints()} disabled={loadingSprints}>
                {loadingSprints ? 'Chargement…' : 'Rafraîchir'}
              </Button>
            </div>

            {sprintsError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
                {sprintsError}
              </div>
            )}

            {sprints.length === 0 && !loadingSprints && !sprintsError && (
              <p className="text-sm text-muted-foreground">Aucun sprint pour ce filtre.</p>
            )}

            {sprints.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="sprint-select">Sprint</Label>
                <select
                  id="sprint-select"
                  value={selectedSprintId ?? ''}
                  onChange={(e) => selectSprint(e.target.value === '' ? null : Number(e.target.value))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">— Aucun —</option>
                  {sprints.map((s) => {
                    const dates = [s.startDate?.slice(0, 10), s.endDate?.slice(0, 10)]
                      .filter(Boolean)
                      .join(' → ')
                    const suffix = dates ? ` (${dates})` : ''
                    return (
                      <option key={s.id} value={s.id}>
                        {s.label}
                        {suffix}
                      </option>
                    )
                  })}
                </select>
              </div>
            )}

            {selectedSprint && sprintContent && (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                <strong>{selectedSprint.label}</strong> · {sprintContent.artifacts.length} item
                {sprintContent.artifacts.length === 1 ? '' : 's'}
                {selectedSprint.semanticStatus && (
                  <Badge className="ml-2" variant={selectedSprint.semanticStatus === 'closed' ? 'secondary' : 'success'}>
                    {selectedSprint.semanticStatus}
                  </Badge>
                )}
              </div>
            )}

            {loadingContent && <p className="text-xs text-muted-foreground">Chargement du contenu…</p>}
            {contentError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
                {contentError}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Custom mode */}
      {mode === 'custom' && (
        <Card>
          <CardHeader>
            <CardTitle>Artefacts personnalisés</CardTitle>
            <CardDescription>
              Sélectionnez des artefacts depuis n&apos;importe quel tracker pour générer une présentation sur mesure.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="custom-label">Titre de la présentation</Label>
              <Input
                id="custom-label"
                placeholder="Ex : Revue Q2 — Équipe DevOps"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                className="max-w-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tracker-select">Tracker</Label>
              {loadingTrackers && <p className="text-xs text-muted-foreground">Chargement des trackers…</p>}
              {!loadingTrackers && trackers.length > 0 && (
                <select
                  id="tracker-select"
                  value={selectedTrackerId ?? ''}
                  onChange={(e) => selectTracker(e.target.value === '' ? null : Number(e.target.value))}
                  className="flex h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">— Choisir un tracker —</option>
                  {trackers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} ({t.artifactCount ?? '?'} items)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {loadingTrackerArtifacts && (
              <p className="text-xs text-muted-foreground">Chargement des artefacts…</p>
            )}

            {trackerArtifacts.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="date-from" className="text-xs">Du</Label>
                    <input
                      id="date-from"
                      type="date"
                      value={dateFrom ?? ''}
                      onChange={(e) => setDateFrom(e.target.value || null)}
                      className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="date-to" className="text-xs">Au</Label>
                    <input
                      id="date-to"
                      type="date"
                      value={dateTo ?? ''}
                      onChange={(e) => setDateTo(e.target.value || null)}
                      className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    />
                  </div>
                  {(dateFrom || dateTo) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setDateFrom(null); setDateTo(null) }}
                      className="text-xs"
                    >
                      Effacer dates
                    </Button>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-xs">
                    Artefacts ({selectedArtifactIds.length} sélectionné{selectedArtifactIds.length === 1 ? '' : 's'})
                  </Label>
                  {selectedArtifactIds.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={clearArtifactSelection} className="text-xs">
                      Tout désélectionner
                    </Button>
                  )}
                </div>
                <div className="max-h-60 overflow-y-auto rounded-md border border-input">
                  {trackerArtifacts.map((a) => {
                    const checked = selectedArtifactIds.includes(a.id)
                    return (
                      <label
                        key={a.id}
                        className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:bg-muted/40"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleArtifact(a.id)}
                          className="h-4 w-4 flex-shrink-0"
                        />
                        <span className="font-mono text-xs text-muted-foreground">#{a.id}</span>
                        <span className="flex-1 truncate">{a.title || '(sans titre)'}</span>
                        {a.submittedOn && (
                          <span className="flex-shrink-0 text-[10px] text-muted-foreground">
                            {a.submittedOn.slice(0, 10)}
                          </span>
                        )}
                        {a.status && (
                          <Badge variant="outline" className="flex-shrink-0 text-[10px]">
                            {a.status}
                          </Badge>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Generation */}
      <Card>
        <CardHeader>
          <CardTitle>Génération de la présentation</CardTitle>
          <CardDescription>
            Pipeline multi-étapes : enrichissement des artefacts → synthèse → 8 slides générés
            indépendamment → assemblage Marp.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => generate('fr')} disabled={!canGenerate}>
              {isGenerating ? 'Génération en cours…' : 'Générer en français'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => generate('en')}
              disabled={!canGenerate}
            >
              Generate in English
            </Button>
            {modelUsed && generationStatus === 'done' && (
              <span className="text-xs text-muted-foreground">
                <Badge variant="outline" className="mr-1">
                  {modelUsed}
                </Badge>
                {formatTokens(usage)}
              </span>
            )}
          </div>

          {/* Progress display */}
          {isGenerating && (
            <div className="space-y-2 rounded-md border border-border bg-muted/30 px-3 py-3">
              <p className="text-sm font-medium">{currentProgressLabel || 'Initialisation…'}</p>
              <ProgressBar done={slidesDone} total={slidesTotal > 0 ? slidesTotal : 9} />
              {slidesTotal > 0 && (
                <p className="text-xs text-muted-foreground">
                  {slidesDone}/{slidesTotal} slides générés
                </p>
              )}
            </div>
          )}

          {generationError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
              {generationError}
            </div>
          )}

          {/* Slide warnings */}
          {slideWarnings.length > 0 && (
            <details className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-yellow-700 dark:text-yellow-400">
                {slideWarnings.length} avertissement{slideWarnings.length > 1 ? 's' : ''}
              </summary>
              <ul className="mt-2 space-y-1">
                {slideWarnings.map((w, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    <span className="font-medium">{w.slide}</span> — {w.warning}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {markdown && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div>
                <Label htmlFor="md-editor" className="mb-1 block text-xs">
                  Markdown éditable
                </Label>
                <textarea
                  id="md-editor"
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  onBlur={() => refreshPreview()}
                  className="h-[480px] w-full rounded-md border border-input bg-transparent p-3 font-mono text-xs leading-relaxed shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  spellCheck={false}
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Aperçu Marp</Label>
                <div className="h-[480px] overflow-hidden rounded-md border border-border">
                  {previewHtml ? (
                    <MarpPreviewFrame html={previewHtml} />
                  ) : previewError ? (
                    <div className="p-3 text-sm text-destructive">{previewError}</div>
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      Aperçu indisponible — éditez le Markdown puis tabulez pour rafraîchir.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {markdown && (
        <Card>
          <CardHeader>
            <CardTitle>Export PowerPoint</CardTitle>
            <CardDescription>
              marp-cli convertit le Markdown en .pptx. Une boîte de dialogue native permet de
              choisir l&apos;emplacement de sortie.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => exportPptx()} disabled={exportStatus === 'rendering'}>
              {exportStatus === 'rendering' ? 'Rendu en cours…' : 'Exporter en .pptx'}
            </Button>
            {exportStatus === 'success' && exportPath && (
              <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm">
                Fichier créé : <code className="text-xs">{exportPath}</code>
              </div>
            )}
            {exportStatus === 'cancelled' && (
              <p className="text-xs text-muted-foreground">Export annulé.</p>
            )}
            {exportStatus === 'error' && exportError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
                {exportError}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default Generation
