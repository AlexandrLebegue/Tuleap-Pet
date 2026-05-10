import * as React from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AdminScanResult } from '@shared/types'
import { useSettings } from '@renderer/stores/settings.store'
import { api } from '@renderer/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Label } from '@renderer/components/ui/label'

function Admin(): React.JSX.Element {
  const config = useSettings((s) => s.config)

  const [windowDays, setWindowDays] = useState<number>(7)
  const [scan, setScan] = useState<AdminScanResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  const [summaryStatus, setSummaryStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [summary, setSummary] = useState<string>('')
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summaryModel, setSummaryModel] = useState<string | null>(null)

  const ready =
    config.tuleapUrl && (config.hasToken || config.hasOAuth) && config.projectId !== null

  const onScan = async (): Promise<void> => {
    setScanning(true)
    setScanError(null)
    setSummary('')
    setSummaryStatus('idle')
    try {
      const result = await api.admin.scan({ windowDays })
      setScan(result)
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err))
    } finally {
      setScanning(false)
    }
  }

  const onSummarize = async (): Promise<void> => {
    if (!scan) return
    setSummaryStatus('running')
    setSummary('')
    setSummaryError(null)
    const result = await api.admin.summarize(scan)
    if (result.ok) {
      setSummary(result.markdown)
      setSummaryModel(result.model)
      setSummaryStatus('done')
    } else {
      setSummaryError(result.error)
      setSummaryStatus('error')
    }
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h2 className="text-2xl font-semibold tracking-tight">Admin</h2>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Configuration requise</CardTitle>
            <CardDescription>
              Connectez-vous à Tuleap et choisissez un projet dans{' '}
              <Link to="/settings" className="underline">
                Réglages
              </Link>{' '}
              avant de lancer un scan.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-8 py-8">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Admin</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Vue globale du projet — activité récente par tracker et synthèse IA.
          </p>
        </div>
        <Badge variant="outline">Phase 4</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scan d&apos;activité</CardTitle>
          <CardDescription>
            Parcourt les trackers du projet et compte les artéfacts modifiés sur la fenêtre choisie.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="window-days">Fenêtre (jours)</Label>
              <select
                id="window-days"
                value={windowDays}
                onChange={(e) => setWindowDays(Number.parseInt(e.target.value, 10))}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value={1}>24 h</option>
                <option value={3}>3 jours</option>
                <option value={7}>7 jours</option>
                <option value={14}>14 jours</option>
                <option value={30}>30 jours</option>
              </select>
            </div>
            <Button onClick={onScan} disabled={scanning}>
              {scanning ? 'Scan en cours…' : 'Lancer le scan'}
            </Button>
            {scan && (
              <span className="text-xs text-muted-foreground">
                Dernier scan : {new Date(scan.scannedAt).toLocaleString()}
              </span>
            )}
          </div>
          {scanError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
              {scanError}
            </div>
          )}
        </CardContent>
      </Card>

      {scan && (
        <Card>
          <CardHeader>
            <CardTitle>Activité par tracker</CardTitle>
            <CardDescription>
              Trié par activité récente décroissante. Total = nombre d&apos;items dans le tracker.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">Total récent : {scan.totalArtifactsRecent}</Badge>
              <Badge variant="secondary">Sprints ouverts : {scan.openSprints.length}</Badge>
            </div>
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Tracker</th>
                    <th className="px-3 py-2 w-24">Récent</th>
                    <th className="px-3 py-2 w-24">Total</th>
                    <th className="px-3 py-2">Items récents</th>
                  </tr>
                </thead>
                <tbody>
                  {scan.trackers.map((t) => (
                    <tr key={t.trackerId} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{t.trackerLabel}</td>
                      <td className="px-3 py-2 tabular-nums">{t.recent}</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{t.total}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {t.recentArtifacts.map((a) => `#${a.id}`).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {scan && (
        <Card>
          <CardHeader>
            <CardTitle>Synthèse IA</CardTitle>
            <CardDescription>
              Le LLM produit un mini-bilan factuel à partir du scan ci-dessus. Aucune donnée
              autre n&apos;est envoyée.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={onSummarize}
              disabled={
                summaryStatus === 'running' ||
                (config.llmProvider === 'local'
                  ? !config.localBaseUrl || !config.localModel
                  : !config.hasLlmKey)
              }
            >
              {summaryStatus === 'running' ? 'Génération…' : 'Générer la synthèse'}
            </Button>
            {config.llmProvider !== 'local' && !config.hasLlmKey && (
              <p className="text-xs text-muted-foreground">
                La synthèse nécessite la clé OpenRouter (Réglages).
              </p>
            )}
            {config.llmProvider === 'local' && (!config.localBaseUrl || !config.localModel) && (
              <p className="text-xs text-muted-foreground">
                La synthèse nécessite la configuration du modèle local (Réglages).
              </p>
            )}
            {summaryError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
                {summaryError}
              </div>
            )}
            {summary && (
              <div className="rounded-md border border-border bg-muted/30 p-4">
                <p className="mb-2 text-xs text-muted-foreground">
                  Modèle : <code>{summaryModel ?? '—'}</code>
                </p>
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{summary}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default Admin
