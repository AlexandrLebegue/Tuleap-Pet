import * as React from 'react'
import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useSettings } from '@renderer/stores/settings.store'
import { useGeneration } from '@renderer/stores/generation.store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Label } from '@renderer/components/ui/label'
import MarpPreviewFrame from '@renderer/components/MarpPreviewFrame'

function formatTokens(usage: { totalTokens?: number; inputTokens?: number; outputTokens?: number } | null): string {
  if (!usage) return ''
  if (typeof usage.totalTokens === 'number') return `${usage.totalTokens} tokens`
  const i = usage.inputTokens ?? 0
  const o = usage.outputTokens ?? 0
  return `${i + o} tokens`
}

function Generation(): React.JSX.Element {
  const config = useSettings((s) => s.config)

  const sprints = useGeneration((s) => s.sprints)
  const loadingSprints = useGeneration((s) => s.loadingSprints)
  const sprintsError = useGeneration((s) => s.sprintsError)
  const statusFilter = useGeneration((s) => s.statusFilter)
  const selectedSprintId = useGeneration((s) => s.selectedSprintId)
  const sprintContent = useGeneration((s) => s.sprintContent)
  const loadingContent = useGeneration((s) => s.loadingContent)
  const contentError = useGeneration((s) => s.contentError)

  const generationStatus = useGeneration((s) => s.generationStatus)
  const generationError = useGeneration((s) => s.generationError)
  const markdown = useGeneration((s) => s.markdown)
  const modelUsed = useGeneration((s) => s.modelUsed)
  const usage = useGeneration((s) => s.usage)

  const previewHtml = useGeneration((s) => s.previewHtml)
  const previewError = useGeneration((s) => s.previewError)

  const exportStatus = useGeneration((s) => s.exportStatus)
  const exportError = useGeneration((s) => s.exportError)
  const exportPath = useGeneration((s) => s.exportPath)

  const loadSprints = useGeneration((s) => s.loadSprints)
  const selectSprint = useGeneration((s) => s.selectSprint)
  const generate = useGeneration((s) => s.generate)
  const setMarkdown = useGeneration((s) => s.setMarkdown)
  const refreshPreview = useGeneration((s) => s.refreshPreview)
  const exportPptx = useGeneration((s) => s.exportPptx)

  const llmReady =
    config.llmProvider === 'local'
      ? Boolean(config.localBaseUrl && config.localModel)
      : config.hasLlmKey
  const ready = config.tuleapUrl && config.hasToken && config.projectId !== null && llmReady
  const sprintCount = sprints.length

  useEffect(() => {
    if (!ready) return
    if (sprintCount === 0 && !loadingSprints && !sprintsError) {
      void loadSprints('open')
    }
  }, [ready, sprintCount, loadingSprints, sprintsError, loadSprints])

  const selectedSprint = useMemo(
    () => sprints.find((s) => s.id === selectedSprintId) ?? null,
    [sprints, selectedSprintId]
  )

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
            Sélectionnez un sprint, générez un compte-rendu Marp puis exportez-le en .pptx.
          </p>
        </div>
        <Badge variant="outline">Phase 1</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sprint</CardTitle>
          <CardDescription>
            Liste des milestones du projet sélectionné. Statuts gérés : ouverts (par défaut), clos,
            tous.
          </CardDescription>
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
              <Label htmlFor="sprint-select">Sprint sélectionné</Label>
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

      <Card>
        <CardHeader>
          <CardTitle>Compte-rendu Marp</CardTitle>
          <CardDescription>
            L&apos;IA génère un Markdown Marp à partir du contenu du sprint et du prompt versionné{' '}
            <code>docs/prompts/sprint_review.md</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => generate('fr')}
              disabled={selectedSprintId === null || generationStatus === 'generating'}
            >
              {generationStatus === 'generating' ? 'Génération…' : 'Générer en français'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => generate('en')}
              disabled={selectedSprintId === null || generationStatus === 'generating'}
            >
              English
            </Button>
            {modelUsed && (
              <span className="text-xs text-muted-foreground">
                <Badge variant="outline" className="mr-1">
                  {modelUsed}
                </Badge>
                {formatTokens(usage)}
              </span>
            )}
          </div>

          {generationError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
              {generationError}
            </div>
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
