import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { useSettings } from '@renderer/stores/settings.store'
import { api } from '@renderer/lib/api'
import type { ConnectionTestResult, ProjectSummary } from '@shared/types'

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

function AuthModeSwitcher(): React.JSX.Element {
  const config = useSettings((s) => s.config)
  const setAuthMode = useSettings((s) => s.setAuthMode)
  const setOAuthClient = useSettings((s) => s.setOAuthClient)
  const startOAuth = useSettings((s) => s.startOAuth)
  const clearOAuth = useSettings((s) => s.clearOAuth)

  const [clientIdDraft, setClientIdDraft] = useState(config.oauthClientId ?? '')
  const [scopeDraft, setScopeDraft] = useState(config.oauthScope)
  const [oauthBusy, setOauthBusy] = useState(false)
  const [oauthMessage, setOauthMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(
    null
  )

  useEffect(() => {
    setClientIdDraft(config.oauthClientId ?? '')
    setScopeDraft(config.oauthScope)
  }, [config.oauthClientId, config.oauthScope])

  const onLaunch = async (): Promise<void> => {
    setOauthBusy(true)
    setOauthMessage(null)
    await setOAuthClient(clientIdDraft.trim() || null, scopeDraft.trim() || null)
    const result = await startOAuth()
    setOauthBusy(false)
    if (result.ok) {
      setOauthMessage({ kind: 'ok', text: 'Authentification OAuth2 réussie.' })
    } else {
      setOauthMessage({ kind: 'err', text: result.error ?? 'Erreur OAuth2.' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={config.authMode === 'token' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setAuthMode('token')}
        >
          Token API personnel
        </Button>
        <Button
          variant={config.authMode === 'oauth2' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setAuthMode('oauth2')}
        >
          OAuth2 + PKCE
        </Button>
        <span className="ml-2 text-xs text-muted-foreground">
          {config.authMode === 'oauth2' ? 'Mode actif : OAuth2.' : 'Mode actif : token API.'}
        </span>
      </div>

      {config.authMode === 'oauth2' && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="space-y-1">
            <Label htmlFor="oauth-client">Client ID</Label>
            <Input
              id="oauth-client"
              placeholder="tlp-client-…"
              value={clientIdDraft}
              onChange={(e) => setClientIdDraft(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="oauth-scope">Scopes</Label>
            <Input
              id="oauth-scope"
              placeholder={config.oauthDefaultScope}
              value={scopeDraft}
              onChange={(e) => setScopeDraft(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Espaces entre les scopes — vide pour réutiliser le défaut.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onLaunch} disabled={oauthBusy || !clientIdDraft.trim()}>
              {oauthBusy ? 'Connexion en cours…' : 'Se connecter via OAuth2'}
            </Button>
            {config.hasOAuth && (
              <>
                <Badge variant="success">Tokens OAuth2 présents</Badge>
                <Button variant="ghost" size="sm" onClick={() => clearOAuth()}>
                  Révoquer localement
                </Button>
              </>
            )}
          </div>
          {oauthMessage && (
            <div
              className={
                oauthMessage.kind === 'ok'
                  ? 'rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm'
                  : 'rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm'
              }
            >
              {oauthMessage.text}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Le navigateur système s&apos;ouvre sur la page Tuleap d&apos;autorisation. Une fois
            consentie, l&apos;application reçoit le code via un serveur loopback éphémère, échange
            le code contre un access_token + refresh_token (PKCE S256), puis chiffre le tout via
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5">safeStorage</code>.
          </p>
        </div>
      )}
    </div>
  )
}

function ProjectSearch({
  selectedLabel,
  hasSelection,
  disabled,
  onSelect,
  onClear
}: {
  selectedLabel: string
  hasSelection: boolean
  disabled: boolean
  onSelect: (project: ProjectSummary) => Promise<void>
  onClear: () => Promise<void>
}): React.JSX.Element {
  const [query, setQuery] = useState(selectedLabel)
  const [results, setResults] = useState<ProjectSummary[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(selectedLabel)
  }, [selectedLabel])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const q = query.trim()
    if (!q || q === selectedLabel) {
      setResults([])
      setError(null)
      return
    }
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const hits = await api.tuleap.listProjects(q)
        setResults(hits)
        setOpen(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query, selectedLabel])

  useEffect(() => {
    function handler(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function pick(p: ProjectSummary): Promise<void> {
    setOpen(false)
    setResults([])
    await onSelect(p)
  }

  async function clear(): Promise<void> {
    setQuery('')
    setOpen(false)
    setResults([])
    await onClear()
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={disabled ? 'Validez d’abord la connexion à Tuleap…' : 'Tapez le nom du projet Tuleap…'}
      />
      {hasSelection && !disabled && (
        <button
          type="button"
          onClick={clear}
          aria-label="Effacer le projet sélectionné"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-xs text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      )}
      {loading && (
        <span className="absolute right-8 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          …
        </span>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => pick(p)}
            >
              <span className="truncate font-medium">{p.label}</span>
              <code className="ml-auto shrink-0 text-xs text-muted-foreground">{p.shortname}</code>
            </button>
          ))}
        </div>
      )}
      {open && !loading && !error && results.length === 0 && query.trim() && query.trim() !== selectedLabel && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-3 text-xs text-muted-foreground shadow-md">
          Aucun projet trouvé pour « {query.trim()} ».
        </div>
      )}
      {error && (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}

function Settings(): React.JSX.Element {
  const config = useSettings((s) => s.config)
  const lastResult = useSettings((s) => s.lastResult)
  const status = useSettings((s) => s.status)
  const projects = useSettings((s) => s.projects)
  const setUrl = useSettings((s) => s.setUrl)
  const setToken = useSettings((s) => s.setToken)
  const clearToken = useSettings((s) => s.clearToken)
  const testConnection = useSettings((s) => s.testConnection)
  const loadProjects = useSettings((s) => s.loadProjects)
  const setProjectId = useSettings((s) => s.setProjectId)
  const llmStatus = useSettings((s) => s.llmStatus)
  const llmLastResult = useSettings((s) => s.llmLastResult)
  const setLlmProvider = useSettings((s) => s.setLlmProvider)
  const setLlmKey = useSettings((s) => s.setLlmKey)
  const clearLlmKey = useSettings((s) => s.clearLlmKey)
  const setLlmModel = useSettings((s) => s.setLlmModel)
  const setLocalBaseUrl = useSettings((s) => s.setLocalBaseUrl)
  const setLocalModel = useSettings((s) => s.setLocalModel)
  const setLocalKey = useSettings((s) => s.setLocalKey)
  const clearLocalKey = useSettings((s) => s.clearLocalKey)
  const setLocalDirectConnection = useSettings((s) => s.setLocalDirectConnection)
  const testLlm = useSettings((s) => s.testLlm)

  const [urlDraft, setUrlDraft] = useState(config.tuleapUrl ?? '')
  const [tokenDraft, setTokenDraft] = useState('')
  const [savingUrl, setSavingUrl] = useState(false)
  const [savingToken, setSavingToken] = useState(false)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [llmKeyDraft, setLlmKeyDraft] = useState('')
  const [llmModelDraft, setLlmModelDraft] = useState(config.llmModel)
  const [savingLlmKey, setSavingLlmKey] = useState(false)
  const [savingLlmModel, setSavingLlmModel] = useState(false)
  const [localUrlDraft, setLocalUrlDraft] = useState(config.localBaseUrl ?? '')
  const [localModelDraft, setLocalModelDraft] = useState(config.localModel ?? '')
  const [localKeyDraft, setLocalKeyDraft] = useState('')
  const [savingLocal, setSavingLocal] = useState(false)

  useEffect(() => {
    setUrlDraft(config.tuleapUrl ?? '')
  }, [config.tuleapUrl])

  useEffect(() => {
    setLlmModelDraft(config.llmModel)
  }, [config.llmModel])

  useEffect(() => {
    setLocalUrlDraft(config.localBaseUrl ?? '')
    setLocalModelDraft(config.localModel ?? '')
  }, [config.localBaseUrl, config.localModel])

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

  // When a projectId is already saved but the store has no matching entry
  // (fresh session), silently fetch the project list once so the search box
  // shows the current label without forcing the user to re-search.
  useEffect(() => {
    const canLoad = Boolean(config.tuleapUrl) && config.hasToken && status === 'ok'
    if (config.projectId !== null && canLoad && !projects.some((p) => p.id === config.projectId)) {
      loadProjects().catch(() => {
        /* silent — connection errors are surfaced by the test-connection card */
      })
    }
  }, [config.projectId, config.tuleapUrl, config.hasToken, status, projects, loadProjects])

  const onProjectSelect = async (project: ProjectSummary): Promise<void> => {
    setProjectError(null)
    try {
      await setProjectId(project.id)
      // Keep store.projects in sync so the Sidebar can display the project label.
      const current = useSettings.getState().projects
      if (!current.some((p) => p.id === project.id)) {
        useSettings.setState({ projects: [project, ...current] })
      }
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : String(err))
    }
  }

  const onProjectClear = async (): Promise<void> => {
    setProjectError(null)
    try {
      await setProjectId(null)
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : String(err))
    }
  }

  const onSaveLlmKey = async (): Promise<void> => {
    if (!llmKeyDraft.trim()) return
    setSavingLlmKey(true)
    try {
      await setLlmKey(llmKeyDraft.trim())
      setLlmKeyDraft('')
    } finally {
      setSavingLlmKey(false)
    }
  }

  const onSaveLlmModel = async (): Promise<void> => {
    setSavingLlmModel(true)
    try {
      await setLlmModel(llmModelDraft.trim() || null)
    } finally {
      setSavingLlmModel(false)
    }
  }

  const onTestLlm = async (): Promise<void> => {
    await testLlm()
  }

  const onSaveLocal = async (): Promise<void> => {
    setSavingLocal(true)
    try {
      await setLocalBaseUrl(localUrlDraft.trim() || null)
      await setLocalModel(localModelDraft.trim() || null)
      if (localKeyDraft.trim()) {
        await setLocalKey(localKeyDraft.trim())
        setLocalKeyDraft('')
      }
    } finally {
      setSavingLocal(false)
    }
  }

  const canTest = Boolean(config.tuleapUrl) && config.hasToken
  const canLoadProjects = canTest && status === 'ok'
  const selectedProject = projects.find((p) => p.id === config.projectId) ?? null
  const selectedProjectLabel = selectedProject
    ? `${selectedProject.label} (${selectedProject.shortname})`
    : ''
  const canTestLlm =
    config.llmProvider === 'local'
      ? Boolean(config.localBaseUrl) && Boolean(config.localModel)
      : config.hasLlmKey

  return (
    <div className="mx-auto max-w-3xl px-8 py-10 space-y-10">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Réglages</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configuration de la connexion Tuleap, du modèle LLM et des outils.
        </p>
      </div>

      {!config.secretStorageAvailable && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
          Le coffre du système d&apos;exploitation n&apos;est pas disponible. Le token ne pourra pas être chiffré
          de manière sécurisée. Sur Linux, installer libsecret peut aider.
        </div>
      )}

      {/* ── Section : Connexion Tuleap ─────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold">Connexion Tuleap</h3>
          <div className="flex-1 h-px bg-border" />
        </div>

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
            Tapez le nom (ou une partie) du projet Tuleap utilisé comme contexte par les autres onglets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label>Projet sélectionné</Label>
          <ProjectSearch
            selectedLabel={selectedProjectLabel}
            hasSelection={config.projectId !== null}
            disabled={!canLoadProjects}
            onSelect={onProjectSelect}
            onClear={onProjectClear}
          />

          {projectError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
              {projectError}
            </div>
          )}

          {!canLoadProjects && (
            <p className="text-xs text-muted-foreground">
              La connexion à Tuleap doit être validée avant de pouvoir rechercher un projet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Authentification Tuleap</CardTitle>
          <CardDescription>
            Choisissez entre un token API personnel (par défaut) et OAuth2 + PKCE. L&apos;OAuth2
            requiert une application enregistrée par un admin Tuleap.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <AuthModeSwitcher />
        </CardContent>
      </Card>
      </section>

      {/* ── Section : Modèle LLM ───────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold">Modèle LLM</h3>
          <div className="flex-1 h-px bg-border" />
        </div>

      <Card>
        <CardHeader>
          <CardTitle>Fournisseur LLM</CardTitle>
          <CardDescription>
            Choisissez entre OpenRouter (cloud) et un modèle local compatible OpenAI (Ollama, LM
            Studio, llama.cpp server…).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Provider selector */}
          <div className="flex gap-2">
            <Button
              variant={config.llmProvider === 'openrouter' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLlmProvider('openrouter')}
            >
              OpenRouter
            </Button>
            <Button
              variant={config.llmProvider === 'local' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLlmProvider('local')}
            >
              Modèle local (OpenAI-compatible)
            </Button>
          </div>

          {/* OpenRouter section */}
          {config.llmProvider === 'openrouter' && (
            <div className="space-y-4 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                La clé est chiffrée via <code>safeStorage</code>. La variable d&apos;environnement{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">OPENROUTER_API_KEY</code>
                , si définie, prend le pas sur la valeur enregistrée.
              </p>
              <div className="space-y-1">
                <Label htmlFor="openrouter-key">Clé API</Label>
                <div className="flex gap-2">
                  <Input
                    id="openrouter-key"
                    type="password"
                    placeholder={
                      config.llmKeyFromEnv
                        ? 'Clé fournie via OPENROUTER_API_KEY'
                        : config.hasLlmKey
                          ? '•••••••••• (déjà enregistrée)'
                          : 'sk-or-v1-…'
                    }
                    value={llmKeyDraft}
                    onChange={(e) => setLlmKeyDraft(e.target.value)}
                    disabled={config.llmKeyFromEnv}
                    autoComplete="off"
                  />
                  <Button
                    onClick={onSaveLlmKey}
                    disabled={savingLlmKey || !llmKeyDraft.trim() || config.llmKeyFromEnv}
                  >
                    Enregistrer
                  </Button>
                </div>
                {config.llmKeyFromEnv && (
                  <p className="pt-1 text-xs text-muted-foreground">
                    <Badge variant="secondary">Source : env</Badge>{' '}
                    <span>
                      La clé locale est ignorée tant que la variable d&apos;env est définie.
                    </span>
                  </p>
                )}
                {!config.llmKeyFromEnv && config.hasLlmKey && (
                  <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                    <Badge variant="success">Clé chiffrée présente</Badge>
                    <Button variant="ghost" size="sm" onClick={() => clearLlmKey()}>
                      Supprimer
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="openrouter-model">Modèle</Label>
                <div className="flex gap-2">
                  <Input
                    id="openrouter-model"
                    placeholder={config.llmDefaultModel}
                    value={llmModelDraft}
                    onChange={(e) => setLlmModelDraft(e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <Button onClick={onSaveLlmModel} variant="secondary" disabled={savingLlmModel}>
                    Enregistrer
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Slug OpenRouter, ex.{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {config.llmDefaultModel}
                  </code>
                  . Vide = défaut.
                </p>
              </div>
            </div>
          )}

          {/* Local / OpenAI-compatible section */}
          {config.llmProvider === 'local' && (
            <div className="space-y-4 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Fonctionne avec Ollama, LM Studio, llama.cpp server, ou tout endpoint compatible
                API OpenAI. La clé API est optionnelle.
              </p>
              <div className="space-y-1">
                <Label htmlFor="local-base-url">URL de base</Label>
                <Input
                  id="local-base-url"
                  placeholder="http://localhost:11434/v1"
                  value={localUrlDraft}
                  onChange={(e) => setLocalUrlDraft(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Inclure le chemin de version (ex. <code>/v1</code>, <code>/v3</code>).
                  Le SDK appellera <code>{'{url}'}/chat/completions</code>.
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="local-model">Modèle</Label>
                <Input
                  id="local-model"
                  placeholder="llama3.2, mistral, gemma3:12b…"
                  value={localModelDraft}
                  onChange={(e) => setLocalModelDraft(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Nom exact du modèle tel qu&apos;exposé par votre serveur.
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="local-key">Clé API (optionnelle)</Label>
                <div className="flex gap-2">
                  <Input
                    id="local-key"
                    type="password"
                    placeholder={
                      config.localKeyFromEnv
                        ? 'Clé fournie via LOCAL_LLM_API_KEY'
                        : config.hasLocalKey
                          ? '•••••••••• (déjà enregistrée)'
                          : 'Laisser vide si non requis'
                    }
                    value={localKeyDraft}
                    onChange={(e) => setLocalKeyDraft(e.target.value)}
                    disabled={config.localKeyFromEnv}
                    autoComplete="off"
                  />
                </div>
                {config.localKeyFromEnv && (
                  <p className="pt-1 text-xs text-muted-foreground">
                    <Badge variant="secondary">Source : env</Badge>{' '}
                    <span>Clé fournie via LOCAL_LLM_API_KEY.</span>
                  </p>
                )}
                {!config.localKeyFromEnv && config.hasLocalKey && (
                  <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                    <Badge variant="success">Clé chiffrée présente</Badge>
                    <Button variant="ghost" size="sm" onClick={() => clearLocalKey()}>
                      Supprimer
                    </Button>
                  </div>
                )}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.localDirectConnection}
                  onChange={(e) => setLocalDirectConnection(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Connexion directe (contourner le proxy système)
                <span className="text-xs text-muted-foreground">
                  — recommandé sur réseau d&apos;entreprise
                </span>
              </label>
              <Button onClick={onSaveLocal} disabled={savingLocal}>
                {savingLocal ? 'Enregistrement…' : 'Enregistrer la configuration locale'}
              </Button>
              {config.localBaseUrl && (
                <p className="text-xs text-muted-foreground">
                  Actif :{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {config.localBaseUrl}
                  </code>{' '}
                  · modèle{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {config.localModel ?? '(non défini)'}
                  </code>
                </p>
              )}
            </div>
          )}

          {/* LLM test (common) */}
          <div className="space-y-2 border-t border-border pt-4">
            <Button onClick={onTestLlm} disabled={!canTestLlm || llmStatus === 'testing'}>
              {llmStatus === 'testing' ? 'Test en cours…' : 'Tester le LLM'}
            </Button>
            {llmLastResult?.ok && (
              <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm">
                <p>
                  <Badge variant="success" className="mr-1">OK</Badge>
                  Fournisseur <code className="text-xs">{llmLastResult.provider}</code>
                  {' · '}Modèle <code className="text-xs">{llmLastResult.model}</code>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-xs italic text-muted-foreground">
                  {llmLastResult.sample || '(réponse vide)'}
                </p>
              </div>
            )}
            {llmLastResult && !llmLastResult.ok && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm space-y-1">
                <p className="font-medium">{llmLastResult.error}</p>
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">
                    Informations de débogage
                  </summary>
                  <ul className="mt-1 space-y-0.5 list-disc list-inside">
                    <li>Fournisseur : <code>{llmLastResult.provider ?? '(inconnu)'}</code></li>
                    <li>Type d'erreur : <code>{llmLastResult.kind}</code></li>
                    {llmLastResult.attemptedModel && (
                      <li>Modèle tenté : <code>{llmLastResult.attemptedModel}</code></li>
                    )}
                    {llmLastResult.status && (
                      <li>Code HTTP : <code>{llmLastResult.status}</code></li>
                    )}
                  </ul>
                </details>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      </section>

      {/* ── Section : Git Explorer ─────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold">Git Explorer</h3>
          <div className="flex-1 h-px bg-border" />
        </div>
        <TempClonePathCard />
      </section>

      {/* ── Section : Jenkins ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold">Jenkins</h3>
          <div className="flex-1 h-px bg-border" />
        </div>
        <JenkinsConfigCard />
      </section>

      {/* ── Section : Chatbot ──────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold">Chatbot</h3>
          <div className="flex-1 h-px bg-border" />
        </div>
        <ChatbotConfigCard />
      </section>
    </div>
  )
}

function TempClonePathCard(): React.JSX.Element {
  const config = useSettings((s) => s.config)
  const refresh = useSettings((s) => s.refresh)
  const [draft, setDraft] = useState(config.tempClonePath ?? '')

  useEffect(() => {
    setDraft(config.tempClonePath ?? '')
  }, [config.tempClonePath])

  const savePath = async (path: string | null): Promise<void> => {
    await api.settings.setTempClonePath(path)
    await refresh()
  }

  const browse = async (): Promise<void> => {
    const result = await api.settings.chooseTempDir()
    if (result.ok) {
      setDraft(result.path)
      await savePath(result.path)
    }
  }

  const toggleSsh = async (value: boolean): Promise<void> => {
    await api.settings.setGitCloneSsh(value)
    await refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dossier temporaire &amp; clonage Git</CardTitle>
        <CardDescription>
          Les jobs Git Explorer clonent temporairement les dépôts ici. Le dossier est nettoyé
          après chaque job.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Dossier temporaire</Label>
          <div className="flex gap-2">
            <Input
              placeholder="/tmp/tuleap-jobs"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void savePath(draft || null)}
              spellCheck={false}
              autoComplete="off"
            />
            <Button variant="secondary" onClick={() => void browse()}>
              Parcourir…
            </Button>
          </div>
          {config.tempClonePath && (
            <p className="text-xs text-muted-foreground">
              Actif : <code className="rounded bg-muted px-1 py-0.5">{config.tempClonePath}</code>
            </p>
          )}
          {!config.tempClonePath && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              Non configuré — les jobs Git Explorer ne pourront pas démarrer.
            </p>
          )}
        </div>

        <div className="space-y-2 border-t pt-4">
          <Label>Méthode de clonage</Label>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={config.gitCloneSsh ? 'default' : 'outline'}
              onClick={() => void toggleSsh(true)}
            >
              SSH
            </Button>
            <Button
              size="sm"
              variant={!config.gitCloneSsh ? 'default' : 'outline'}
              onClick={() => void toggleSsh(false)}
            >
              HTTPS + token
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {config.gitCloneSsh
              ? 'SSH — utilise votre clé SSH système. Aucun token requis.'
              : 'HTTPS — injecte votre token Tuleap dans l\'URL de clonage.'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function ChatbotConfigCard(): React.JSX.Element {
  const config = useSettings((s) => s.config)
  const setChatbotExpertMode = useSettings((s) => s.setChatbotExpertMode)
  const setChatbotDoxygenMode = useSettings((s) => s.setChatbotDoxygenMode)
  const setChatbotToolsEnabled = useSettings((s) => s.setChatbotToolsEnabled)
  const setChatbotJenkinsToolsEnabled = useSettings((s) => s.setChatbotJenkinsToolsEnabled)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration du Chatbot</CardTitle>
        <CardDescription>
          Activez des modes supplémentaires pour enrichir le prompt système du chatbot.
          Ces paramètres s&apos;appliquent à toutes les nouvelles conversations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.chatbotExpertMode}
            onChange={(e) => setChatbotExpertMode(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <div>
            <p className="text-sm font-medium">Mode Expert C/C++</p>
            <p className="text-xs text-muted-foreground">
              Injecte les règles de codage (types, conventions de nommage, exemples) dans le prompt système.
              Recommandé pour la génération de code embarqué.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.chatbotDoxygenMode}
            onChange={(e) => setChatbotDoxygenMode(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <div>
            <p className="text-sm font-medium">Mode Doxygen</p>
            <p className="text-xs text-muted-foreground">
              Ajoute les règles de documentation Doxygen complètes (en-tête de fichier, fonctions,
              structures, balises de contrôle). Actif uniquement avec le mode Expert.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.chatbotToolsEnabled}
            onChange={(e) => setChatbotToolsEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <div>
            <p className="text-sm font-medium">Activer les outils Tuleap</p>
            <p className="text-xs text-muted-foreground">
              Permet au chatbot d&apos;interroger l&apos;API Tuleap (projets, artéfacts, sprints).
              Désactiver si le modèle ne supporte pas le tool calling.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.chatbotJenkinsToolsEnabled}
            onChange={(e) => setChatbotJenkinsToolsEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <div>
            <p className="text-sm font-medium">Activer les outils Jenkins</p>
            <p className="text-xs text-muted-foreground">
              Permet au chatbot d&apos;interroger Jenkins (jobs, historique de builds, rapports de tests).
              Sans effet si les outils Tuleap sont désactivés.
            </p>
          </div>
        </label>

        {config.chatbotExpertMode && (
          <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            Mode actif :{' '}
            <span className="font-medium text-foreground">
              Expert{config.chatbotDoxygenMode ? ' + Doxygen' : ''}
            </span>
            {' '}— le prompt système inclut les règles de codage
            {config.chatbotDoxygenMode ? ' et de documentation.' : '.'}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function JenkinsConfigCard(): React.JSX.Element {
  const config = useSettings((s) => s.config)
  const refresh = useSettings((s) => s.refresh)

  const [urlDraft, setUrlDraft] = useState(config.jenkinsUrl ?? '')
  const [userDraft, setUserDraft] = useState(config.jenkinsUser ?? '')
  const [tokenDraft, setTokenDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    setUrlDraft(config.jenkinsUrl ?? '')
    setUserDraft(config.jenkinsUser ?? '')
  }, [config.jenkinsUrl, config.jenkinsUser])

  const onSave = async (): Promise<void> => {
    setSaving(true)
    setSaveMsg(null)
    try {
      await api.settings.setJenkinsUrl(urlDraft.trim() || null)
      await api.settings.setJenkinsUser(userDraft.trim() || null)
      if (tokenDraft.trim()) {
        await api.settings.setJenkinsToken(tokenDraft.trim())
        setTokenDraft('')
      }
      await refresh()
      setSaveMsg({ ok: true, text: 'Configuration Jenkins enregistrée.' })
    } catch (err) {
      setSaveMsg({ ok: false, text: err instanceof Error ? err.message : String(err) })
    } finally {
      setSaving(false)
    }
  }

  const onTestConnection = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.jenkins.testConnection()
      if (result.ok) {
        setTestResult({ ok: true, text: `Connecté — ${result.nodeName} (Jenkins ${result.version})` })
      } else {
        setTestResult({ ok: false, text: result.error })
      }
    } catch (err) {
      setTestResult({ ok: false, text: err instanceof Error ? err.message : String(err) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration Jenkins</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="jenkins-url">URL Jenkins</Label>
          <Input
            id="jenkins-url"
            placeholder="https://jenkins.example.com"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="jenkins-user">Nom d'utilisateur</Label>
          <Input
            id="jenkins-user"
            placeholder="mon.utilisateur"
            value={userDraft}
            onChange={(e) => setUserDraft(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="jenkins-token">API Token</Label>
          <Input
            id="jenkins-token"
            type="password"
            placeholder={config.hasJenkinsToken ? '•••••••••• (déjà enregistré)' : 'Votre token API Jenkins'}
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            autoComplete="off"
          />
          {config.hasJenkinsToken && (
            <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
              <Badge variant="secondary">Token présent</Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await api.settings.clearJenkinsToken()
                  await refresh()
                }}
              >
                Supprimer
              </Button>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={onSave} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Button
            variant="outline"
            onClick={onTestConnection}
            disabled={testing || !config.jenkinsUrl || !config.hasJenkinsToken}
          >
            {testing ? 'Test…' : 'Tester la connexion'}
          </Button>
        </div>
        {saveMsg && (
          <p className={`text-sm ${saveMsg.ok ? 'text-green-600' : 'text-destructive'}`}>
            {saveMsg.text}
          </p>
        )}
        {testResult && (
          <p className={`text-sm ${testResult.ok ? 'text-green-600' : 'text-destructive'}`}>
            {testResult.text}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default Settings
