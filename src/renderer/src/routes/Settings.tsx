import * as React from 'react'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { useSettings } from '@renderer/stores/settings.store'
import type { ConnectionTestResult } from '@shared/types'

function describeError(result: ConnectionTestResult & { ok: false }): string {
  switch (result.kind) {
    case 'auth':
      return 'Token refusé par Tuleap. Vérifiez la clé d’accès personnelle dans vos préférences.'
    case 'network':
      return `Connexion impossible : ${result.error}`
    case 'http':
      return `Tuleap a renvoyé HTTP ${result.status ?? '?'} : ${result.error}`
    case 'schema':
      return `Réponse Tuleap inattendue : ${result.error}`
    default:
      return result.error
  }
}

function Settings(): React.JSX.Element {
  const config = useSettings((s) => s.config)
  const lastResult = useSettings((s) => s.lastResult)
  const status = useSettings((s) => s.status)
  const projects = useSettings((s) => s.projects)
  const loadingProjects = useSettings((s) => s.loadingProjects)
  const setUrl = useSettings((s) => s.setUrl)
  const setToken = useSettings((s) => s.setToken)
  const clearToken = useSettings((s) => s.clearToken)
  const testConnection = useSettings((s) => s.testConnection)
  const loadProjects = useSettings((s) => s.loadProjects)
  const setProjectId = useSettings((s) => s.setProjectId)

  const [urlDraft, setUrlDraft] = useState(config.tuleapUrl ?? '')
  const [tokenDraft, setTokenDraft] = useState('')
  const [savingUrl, setSavingUrl] = useState(false)
  const [savingToken, setSavingToken] = useState(false)
  const [projectError, setProjectError] = useState<string | null>(null)

  useEffect(() => {
    setUrlDraft(config.tuleapUrl ?? '')
  }, [config.tuleapUrl])

  const onSaveUrl = async (): Promise<void> => {
    setSavingUrl(true)
    try {
      await setUrl(urlDraft.trim())
    } finally {
      setSavingUrl(false)
    }
  }

  const onSaveToken = async (): Promise<void> => {
    if (!tokenDraft.trim()) return
    setSavingToken(true)
    try {
      await setToken(tokenDraft.trim())
      setTokenDraft('')
    } finally {
      setSavingToken(false)
    }
  }

  const onTest = async (): Promise<void> => {
    await testConnection()
  }

  const onLoadProjects = async (): Promise<void> => {
    setProjectError(null)
    try {
      await loadProjects()
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : String(err))
    }
  }

  const onSelectProject = async (event: React.ChangeEvent<HTMLSelectElement>): Promise<void> => {
    const value = event.target.value
    await setProjectId(value === '' ? null : Number(value))
  }

  const canTest = Boolean(config.tuleapUrl) && config.hasToken
  const canLoadProjects = canTest && status === 'ok'

  return (
    <div className="mx-auto max-w-3xl px-8 py-10 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Réglages</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connexion à votre instance Tuleap et choix du projet de travail.
        </p>
      </div>

      {!config.secretStorageAvailable && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
          Le coffre du système d&apos;exploitation n&apos;est pas disponible. Le token ne pourra pas être chiffré
          de manière sécurisée. Sur Linux, installer libsecret peut aider.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Instance Tuleap</CardTitle>
          <CardDescription>
            URL racine de votre instance. Pour tester rapidement, utilisez{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">https://tuleap.net</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="tuleap-url">URL</Label>
            <div className="flex gap-2">
              <Input
                id="tuleap-url"
                placeholder="https://tuleap.example.com"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <Button onClick={onSaveUrl} disabled={savingUrl} variant="secondary">
                Enregistrer
              </Button>
            </div>
            {config.tuleapUrl && (
              <p className="text-xs text-muted-foreground">
                Enregistré : <code>{config.tuleapUrl}</code>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Token API personnel</CardTitle>
          <CardDescription>
            Créez une clé d&apos;accès dans Tuleap → <em>Account → Preferences → Access Keys</em>. Le
            token est chiffré localement via le coffre du système et n&apos;est jamais transmis au
            renderer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="tuleap-token">Token</Label>
            <div className="flex gap-2">
              <Input
                id="tuleap-token"
                type="password"
                placeholder={config.hasToken ? '•••••••••• (déjà enregistré)' : 'tlp.k1.…'}
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                autoComplete="off"
              />
              <Button onClick={onSaveToken} disabled={savingToken || !tokenDraft.trim()}>
                Enregistrer
              </Button>
            </div>
            {config.hasToken && (
              <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                <Badge variant="success">Token chiffré présent</Badge>
                <Button variant="ghost" size="sm" onClick={() => clearToken()}>
                  Supprimer
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test de connexion</CardTitle>
          <CardDescription>Appelle <code>GET /api/users/self</code>.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={onTest} disabled={!canTest || status === 'testing'}>
            {status === 'testing' ? 'Test en cours…' : 'Tester la connexion'}
          </Button>
          {lastResult?.ok && (
            <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm">
              Connecté en tant que <strong>{lastResult.realName || lastResult.username}</strong>{' '}
              <span className="text-muted-foreground">(@{lastResult.username})</span>
            </div>
          )}
          {lastResult && !lastResult.ok && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
              {describeError(lastResult)}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Projet</CardTitle>
          <CardDescription>
            Choisissez le projet utilisé comme contexte par les autres onglets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={onLoadProjects} disabled={!canLoadProjects || loadingProjects}>
            {loadingProjects ? 'Chargement…' : 'Charger les projets accessibles'}
          </Button>

          {projectError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
              {projectError}
            </div>
          )}

          {projects.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="project-select">Projet sélectionné</Label>
              <select
                id="project-select"
                value={config.projectId ?? ''}
                onChange={onSelectProject}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">— Aucun —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({p.shortname})
                  </option>
                ))}
              </select>
            </div>
          )}

          {!projects.length && !canLoadProjects && (
            <p className="text-xs text-muted-foreground">
              La connexion doit être validée avant de charger la liste des projets.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default Settings
