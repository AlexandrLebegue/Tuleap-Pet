import * as React from 'react'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { useSettings } from '@renderer/stores/settings.store'
import { useJenkins } from '@renderer/stores/jenkins.store'
import type {
  JenkinsBuildDetail,
  JenkinsBuildResult,
  JenkinsBuildSummary,
  JenkinsJob,
  JenkinsNode,
  JenkinsQueueItem
} from '@shared/types'

// ---- Helpers ----

function resultBadge(
  result: JenkinsBuildResult,
  building: boolean
): React.JSX.Element {
  if (building) return <Badge variant="secondary">En cours</Badge>
  switch (result) {
    case 'SUCCESS': return <Badge className="bg-green-600 text-white">Succès</Badge>
    case 'FAILURE': return <Badge variant="destructive">Échec</Badge>
    case 'UNSTABLE': return <Badge variant="secondary" className="text-yellow-700">Instable</Badge>
    case 'ABORTED': return <Badge variant="outline">Annulé</Badge>
    default: return <Badge variant="outline">—</Badge>
  }
}

function colorBadge(color: string): React.JSX.Element {
  const base = color.replace('_anime', '')
  const building = color.endsWith('_anime')
  if (building) return <Badge variant="secondary">En cours</Badge>
  switch (base) {
    case 'blue': return <Badge className="bg-green-600 text-white">OK</Badge>
    case 'red': return <Badge variant="destructive">KO</Badge>
    case 'yellow': return <Badge variant="secondary" className="text-yellow-700">Instable</Badge>
    case 'disabled': return <Badge variant="outline">Désactivé</Badge>
    default: return <Badge variant="outline">—</Badge>
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}m ${r}s`
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

// ---- Sub-components ----

function BuildDetailPanel({ detail, jobName }: { detail: JenkinsBuildDetail; jobName: string }): React.JSX.Element {
  const investigation = useJenkins((s) => s.investigation)
  const investigating = useJenkins((s) => s.investigating)
  const investigationError = useJenkins((s) => s.investigationError)
  const investigateFailure = useJenkins((s) => s.investigateFailure)
  const closeBuildDetail = useJenkins((s) => s.closeBuildDetail)
  const clearInvestigation = useJenkins((s) => s.clearInvestigation)

  const canInvestigate = detail.result === 'FAILURE' || detail.result === 'UNSTABLE'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={closeBuildDetail}>← Retour</Button>
        <h3 className="font-semibold">{detail.fullDisplayName}</h3>
        {resultBadge(detail.result, detail.building)}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">Durée</span>
          <p className="font-medium">{formatDuration(detail.duration)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Démarré</span>
          <p className="font-medium">{formatTimestamp(detail.timestamp)}</p>
        </div>
      </div>

      {detail.testReport && (
        <div className="rounded-md border p-3 text-sm space-y-1">
          <p className="font-medium">Résultats de tests</p>
          <div className="flex gap-4">
            <span className="text-green-600">{detail.testReport.passCount} ✓</span>
            <span className="text-red-500">{detail.testReport.failCount} ✗</span>
            <span className="text-muted-foreground">{detail.testReport.skipCount} ignorés</span>
          </div>
        </div>
      )}

      {detail.parameters.length > 0 && (
        <div className="text-sm space-y-1">
          <p className="font-medium text-muted-foreground">Paramètres</p>
          {detail.parameters.map((p) => (
            <div key={p.name} className="flex gap-2">
              <span className="text-muted-foreground">{p.name}:</span>
              <span>{String(p.value ?? '—')}</span>
            </div>
          ))}
        </div>
      )}

      {canInvestigate && (
        <div className="space-y-3">
          <Button
            size="sm"
            variant="outline"
            disabled={investigating}
            onClick={() => {
              clearInvestigation()
              void investigateFailure(jobName, detail.number)
            }}
          >
            {investigating ? 'Analyse en cours…' : '🔍 Analyser l\'échec avec l\'IA'}
          </Button>

          {investigationError && (
            <p className="text-sm text-destructive">{investigationError}</p>
          )}

          {investigation && (
            <div className="rounded-md border p-4 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">Analyse IA</span>
                <Badge variant={investigation.severity === 'error' ? 'destructive' : 'secondary'}>
                  {investigation.severity}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Cause racine</p>
                <p className="text-sm">{investigation.rootCause}</p>
              </div>
              {investigation.affectedSteps.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Étapes/fichiers impactés</p>
                  <ul className="text-sm list-disc list-inside space-y-0.5">
                    {investigation.affectedSteps.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Suggestion</p>
                <p className="text-sm">{investigation.suggestion}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <a
        href={detail.consoleUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-muted-foreground underline"
      >
        Voir la console →
      </a>
    </div>
  )
}

function BuildHistoryPanel({ jobName }: { jobName: string }): React.JSX.Element {
  const buildHistory = useJenkins((s) => s.buildHistory)
  const loadingHistory = useJenkins((s) => s.historyError)
  const historyError = useJenkins((s) => s.historyError)
  const buildDetail = useJenkins((s) => s.buildDetail)
  const loadingDetail = useJenkins((s) => s.loadingDetail)
  const detailError = useJenkins((s) => s.detailError)
  const openBuildDetail = useJenkins((s) => s.openBuildDetail)
  const clearSelectedJob = useJenkins((s) => s.clearSelectedJob)

  if (buildDetail) {
    return <BuildDetailPanel detail={buildDetail} jobName={jobName} />
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={clearSelectedJob}>← Retour</Button>
        <h3 className="font-semibold truncate">{jobName}</h3>
      </div>

      {historyError && <p className="text-sm text-destructive">{historyError}</p>}
      {loadingDetail && <p className="text-sm text-muted-foreground">Chargement du détail…</p>}
      {detailError && <p className="text-sm text-destructive">{detailError}</p>}

      {!loadingHistory && buildHistory.length === 0 && !historyError && (
        <p className="text-sm text-muted-foreground">Aucun build.</p>
      )}

      <div className="space-y-1">
        {buildHistory.map((build: JenkinsBuildSummary) => (
          <button
            key={build.number}
            className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-accent/50 text-left"
            onClick={() => void openBuildDetail(jobName, build.number)}
          >
            <div className="flex items-center gap-2">
              {resultBadge(build.result, build.building)}
              <span className="font-medium">{build.displayName}</span>
            </div>
            <div className="flex items-center gap-4 text-muted-foreground text-xs">
              <span>{formatDuration(build.duration)}</span>
              <span>{formatTimestamp(build.timestamp)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function JobsTab(): React.JSX.Element {
  const jobs = useJenkins((s) => s.jobs)
  const loadingJobs = useJenkins((s) => s.loadingJobs)
  const jobsError = useJenkins((s) => s.jobsError)
  const folderStack = useJenkins((s) => s.folderStack)
  const selectedJobName = useJenkins((s) => s.selectedJobName)
  const loadingHistory = useJenkins((s) => s.loadingHistory)
  const enterFolder = useJenkins((s) => s.enterFolder)
  const exitFolder = useJenkins((s) => s.exitFolder)
  const selectJob = useJenkins((s) => s.selectJob)
  const loadJobs = useJenkins((s) => s.loadJobs)

  if (selectedJobName) {
    return (
      <div className="p-4">
        {loadingHistory ? (
          <p className="text-sm text-muted-foreground">Chargement de l'historique…</p>
        ) : (
          <BuildHistoryPanel jobName={selectedJobName} />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3 p-4">
      {folderStack.length > 0 && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <button className="hover:underline" onClick={() => void loadJobs()}>Racine</button>
          {folderStack.map((f, i) => (
            <React.Fragment key={i}>
              <span>/</span>
              <button
                className="hover:underline"
                onClick={() => {
                  const partial = folderStack.slice(0, i + 1)
                  const target = partial[partial.length - 1]!
                  void loadJobs(target)
                }}
              >
                {f}
              </button>
            </React.Fragment>
          ))}
          <Button variant="ghost" size="sm" onClick={() => void exitFolder()}>← Retour</Button>
        </div>
      )}

      {loadingJobs && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {jobsError && <p className="text-sm text-destructive">{jobsError}</p>}
      {!loadingJobs && jobs.length === 0 && !jobsError && (
        <p className="text-sm text-muted-foreground">Aucun job trouvé.</p>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-xs">
            <th className="py-2 text-left font-medium">Job</th>
            <th className="py-2 text-left font-medium">Statut</th>
            <th className="py-2 text-left font-medium">Build</th>
            <th className="py-2 text-left font-medium hidden md:table-cell">Date</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job: JenkinsJob) => (
            <tr
              key={job.name}
              className="border-b hover:bg-accent/30 cursor-pointer"
              onClick={() => {
                if (job.isFolder) {
                  void enterFolder(job.name)
                } else {
                  void selectJob(job.name)
                }
              }}
            >
              <td className="py-2 pr-3">
                <span className="font-medium">{job.displayName}</span>
                {job.isFolder && (
                  <span className="ml-2 text-xs text-muted-foreground">📁</span>
                )}
              </td>
              <td className="py-2 pr-3">{colorBadge(job.color)}</td>
              <td className="py-2 pr-3 text-muted-foreground">
                {job.lastBuildNumber != null ? `#${job.lastBuildNumber}` : '—'}
              </td>
              <td className="py-2 text-muted-foreground hidden md:table-cell">
                {job.lastBuildTimestamp ? formatTimestamp(job.lastBuildTimestamp) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function QueueTab(): React.JSX.Element {
  const queue = useJenkins((s) => s.queue)
  const loadingQueue = useJenkins((s) => s.loadingQueue)
  const queueError = useJenkins((s) => s.queueError)

  if (loadingQueue) return <p className="text-sm text-muted-foreground p-4">Chargement…</p>
  if (queueError) return <p className="text-sm text-destructive p-4">{queueError}</p>
  if (queue.length === 0) return <p className="text-sm text-muted-foreground p-4">File d'attente vide.</p>

  return (
    <table className="w-full text-sm p-4">
      <thead>
        <tr className="border-b text-muted-foreground text-xs">
          <th className="py-2 text-left font-medium px-4">Job</th>
          <th className="py-2 text-left font-medium">Depuis</th>
          <th className="py-2 text-left font-medium">Statut</th>
          <th className="py-2 text-left font-medium hidden md:table-cell">Raison</th>
        </tr>
      </thead>
      <tbody>
        {queue.map((item: JenkinsQueueItem) => (
          <tr key={item.id} className="border-b">
            <td className="py-2 px-4 font-medium">{item.jobName}</td>
            <td className="py-2">{formatTimestamp(item.inQueueSince)}</td>
            <td className="py-2">
              {item.blocked ? (
                <Badge variant="destructive">Bloqué</Badge>
              ) : item.buildable ? (
                <Badge className="bg-green-600 text-white">Buildable</Badge>
              ) : item.stuck ? (
                <Badge variant="secondary">Bloqué</Badge>
              ) : (
                <Badge variant="outline">En attente</Badge>
              )}
            </td>
            <td className="py-2 text-muted-foreground hidden md:table-cell">{item.why ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function NodesTab(): React.JSX.Element {
  const nodes = useJenkins((s) => s.nodes)
  const loadingNodes = useJenkins((s) => s.loadingNodes)
  const nodesError = useJenkins((s) => s.nodesError)
  const nodesPermission = useJenkins((s) => s.nodesPermission)

  if (loadingNodes) return <p className="text-sm text-muted-foreground p-4">Chargement…</p>
  if (!nodesPermission) {
    return <p className="text-sm text-muted-foreground p-4">Permissions insuffisantes pour lire les nœuds Jenkins.</p>
  }
  if (nodesError) return <p className="text-sm text-destructive p-4">{nodesError}</p>
  if (nodes.length === 0) return <p className="text-sm text-muted-foreground p-4">Aucun nœud.</p>

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-muted-foreground text-xs">
          <th className="py-2 text-left font-medium px-4">Nœud</th>
          <th className="py-2 text-left font-medium">Statut</th>
          <th className="py-2 text-left font-medium hidden md:table-cell">Exec.</th>
          <th className="py-2 text-left font-medium hidden md:table-cell">RAM libre</th>
          <th className="py-2 text-left font-medium hidden md:table-cell">Disque</th>
        </tr>
      </thead>
      <tbody>
        {nodes.map((node: JenkinsNode) => (
          <tr key={node.displayName} className="border-b">
            <td className="py-2 px-4">
              <p className="font-medium">{node.displayName}</p>
              {node.description && (
                <p className="text-xs text-muted-foreground">{node.description}</p>
              )}
            </td>
            <td className="py-2">
              {node.status === 'online' ? (
                <Badge className="bg-green-600 text-white">En ligne</Badge>
              ) : node.status === 'temporarily-offline' ? (
                <Badge variant="secondary">Temp. hors ligne</Badge>
              ) : (
                <Badge variant="destructive">Hors ligne</Badge>
              )}
              {node.idle && node.status === 'online' && (
                <span className="ml-1 text-xs text-muted-foreground">(inactif)</span>
              )}
            </td>
            <td className="py-2 text-muted-foreground hidden md:table-cell">{node.numExecutors}</td>
            <td className="py-2 text-muted-foreground hidden md:table-cell">
              {node.monitorData.availableRamMb != null ? `${node.monitorData.availableRamMb} Mo` : '—'}
            </td>
            <td className="py-2 text-muted-foreground hidden md:table-cell">
              {node.monitorData.diskSpaceGb != null ? `${node.monitorData.diskSpaceGb} Go` : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---- Main route ----

type Tab = 'jobs' | 'queue' | 'nodes'

export default function Jenkins(): React.JSX.Element {
  const config = useSettings((s) => s.config)
  const [activeTab, setActiveTab] = useState<Tab>('jobs')

  const connectionStatus = useJenkins((s) => s.connectionStatus)
  const connectionResult = useJenkins((s) => s.connectionResult)
  const testConnection = useJenkins((s) => s.testConnection)
  const loadJobs = useJenkins((s) => s.loadJobs)
  const loadQueue = useJenkins((s) => s.loadQueue)
  const loadNodes = useJenkins((s) => s.loadNodes)

  const isConfigured = Boolean(config.jenkinsUrl && config.hasJenkinsToken)

  useEffect(() => {
    if (!isConfigured) return
    void testConnection()
    void loadJobs()
    void loadQueue()
    void loadNodes()
  }, [isConfigured])

  useEffect(() => {
    if (!isConfigured) return
    if (activeTab === 'queue') void loadQueue()
    if (activeTab === 'nodes') void loadNodes()
  }, [activeTab, isConfigured])

  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-xl px-8 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Jenkins non configuré</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Configurez l'URL Jenkins, le nom d'utilisateur et le token API dans les{' '}
              <strong>Paramètres</strong> pour accéder à cette section.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'jobs', label: 'Jobs' },
    { id: 'queue', label: 'File d\'attente' },
    { id: 'nodes', label: 'Nœuds' }
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-8 py-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">Jenkins</h2>
          {connectionStatus === 'ok' && connectionResult?.ok && (
            <Badge className="bg-green-600 text-white text-xs">
              {connectionResult.nodeName || 'Connecté'}
            </Badge>
          )}
          {connectionStatus === 'error' && (
            <Badge variant="destructive" className="text-xs">Hors ligne</Badge>
          )}
          {connectionStatus === 'testing' && (
            <Badge variant="secondary" className="text-xs">Connexion…</Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void testConnection()
            void loadJobs()
            if (activeTab === 'queue') void loadQueue()
            if (activeTab === 'nodes') void loadNodes()
          }}
        >
          Rafraîchir
        </Button>
      </div>

      {connectionStatus === 'error' && connectionResult && !connectionResult.ok && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {connectionResult.error}
        </div>
      )}

      <Card>
        <div className="flex border-b">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-foreground text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="min-h-[300px]">
          {activeTab === 'jobs' && <JobsTab />}
          {activeTab === 'queue' && <QueueTab />}
          {activeTab === 'nodes' && <NodesTab />}
        </div>
      </Card>
    </div>
  )
}
