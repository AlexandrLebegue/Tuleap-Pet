import * as React from 'react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSettings } from '@renderer/stores/settings.store'
import { useCoder } from '@renderer/stores/coder.store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'

function Coder(): React.JSX.Element {
  const config = useSettings((s) => s.config)

  const init = useCoder((s) => s.init)
  const shutdown = useCoder((s) => s.shutdown)
  const artifactIdInput = useCoder((s) => s.artifactIdInput)
  const setArtifactIdInput = useCoder((s) => s.setArtifactIdInput)
  const artifact = useCoder((s) => s.artifact)
  const context = useCoder((s) => s.context)
  const setContext = useCoder((s) => s.setContext)
  const status = useCoder((s) => s.status)
  const buildError = useCoder((s) => s.buildError)
  const build = useCoder((s) => s.build)
  const cwd = useCoder((s) => s.cwd)
  const chooseCwd = useCoder((s) => s.chooseCwd)
  const setCwd = useCoder((s) => s.setCwd)
  const binaryPath = useCoder((s) => s.binaryPath)
  const setBinaryPath = useCoder((s) => s.setBinaryPath)
  const log = useCoder((s) => s.log)
  const exitCode = useCoder((s) => s.exitCode)
  const sessionId = useCoder((s) => s.sessionId)
  const run = useCoder((s) => s.run)
  const kill = useCoder((s) => s.kill)

  const ready = config.tuleapUrl && (config.hasToken || config.hasOAuth)

  useEffect(() => {
    init(config.openCodeBinary ?? 'opencode')
    return () => shutdown()
  }, [init, shutdown, config.openCodeBinary])

  if (!ready) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h2 className="text-2xl font-semibold tracking-tight">Coder</h2>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Configuration requise</CardTitle>
            <CardDescription>
              Connectez-vous à Tuleap dans{' '}
              <Link to="/settings" className="underline">
                Réglages
              </Link>{' '}
              avant d&apos;ouvrir un ticket dans OpenCode.
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
          <h2 className="text-2xl font-semibold tracking-tight">Coder</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Charge un ticket Tuleap, génère un contexte Markdown et lance OpenCode dessus.
          </p>
        </div>
        <Badge variant="outline">Phase 3</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Ticket Tuleap</CardTitle>
          <CardDescription>
            Saisissez l&apos;ID d&apos;un artéfact pour récupérer son détail (titre, description,
            valeurs, liens).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="artifact-id">ID artéfact</Label>
              <Input
                id="artifact-id"
                placeholder="1234"
                value={artifactIdInput}
                onChange={(e) => setArtifactIdInput(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <Button onClick={() => build()} disabled={status === 'building'}>
              {status === 'building' ? 'Chargement…' : 'Construire le contexte'}
            </Button>
          </div>
          {buildError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
              {buildError}
            </div>
          )}
          {artifact && (
            <p className="text-xs text-muted-foreground">
              Chargé : <code>#{artifact.id}</code> — {artifact.title || '(sans titre)'}
              {artifact.status && <span className="ml-2"><Badge variant="outline">{artifact.status}</Badge></span>}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Contexte injecté à OpenCode</CardTitle>
          <CardDescription>
            Éditable. Tout ce qui est dans cette zone sera passé comme prompt à <code>opencode run</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Le contexte du ticket apparaîtra ici."
            className="h-[260px] w-full rounded-md border border-input bg-transparent p-3 font-mono text-xs leading-relaxed shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            spellCheck={false}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigator.clipboard.writeText(context)}
            disabled={!context}
          >
            Copier dans le presse-papier
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Lancer OpenCode</CardTitle>
          <CardDescription>
            Spawn un sous-processus <code>opencode run</code>. La sortie est capturée
            ci-dessous. OpenCode doit être installé localement (cf.{' '}
            <a className="underline" href="https://opencode.ai/" target="_blank" rel="noreferrer">
              opencode.ai
            </a>
            ).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="opencode-binary">Binaire</Label>
              <Input
                id="opencode-binary"
                value={binaryPath}
                onChange={(e) => setBinaryPath(e.target.value)}
                placeholder="opencode"
                spellCheck={false}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="opencode-cwd">Dossier de travail</Label>
              <div className="flex gap-2">
                <Input
                  id="opencode-cwd"
                  value={cwd ?? ''}
                  onChange={(e) => setCwd(e.target.value || null)}
                  placeholder="/chemin/vers/le/repo"
                  spellCheck={false}
                />
                <Button variant="outline" onClick={() => chooseCwd()}>
                  Parcourir…
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => run()} disabled={!context.trim() || status === 'running'}>
              {status === 'running' ? 'Exécution…' : 'Lancer OpenCode'}
            </Button>
            {sessionId && (
              <Button variant="destructive" size="sm" onClick={() => kill()}>
                Arrêter (SIGTERM)
              </Button>
            )}
            {exitCode !== null && (
              <Badge variant={exitCode === 0 ? 'success' : 'destructive'}>
                exit {exitCode}
              </Badge>
            )}
          </div>

          {log && (
            <pre className="max-h-[360px] overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground">
              {log}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default Coder
