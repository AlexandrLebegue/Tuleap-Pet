import * as React from 'react'
import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'

export default function BugRepro(): React.JSX.Element {
  const [artifactId, setArtifactId] = useState('')
  const [repoPath, setRepoPath] = useState('')
  const [saveToFile, setSaveToFile] = useState(false)
  const [result, setResult] = useState<{
    testLanguage: string
    testFileSuggested: string
    testCode: string
    explanation: string
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pickRepo(): Promise<void> {
    const r = await window.api.ticketBranch.chooseRepo()
    if (r.ok) setRepoPath(r.path)
  }

  async function generate(): Promise<void> {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const id = Number.parseInt(artifactId, 10)
      if (!Number.isFinite(id)) throw new Error('Artifact ID invalide')
      const r = await window.api.bugRepro.generate({ artifactId: id, repoPath, saveToFile })
      if (!r.ok) throw new Error(r.error)
      setResult({
        testLanguage: r.testLanguage,
        testFileSuggested: r.testFileSuggested,
        testCode: r.testCode,
        explanation: r.explanation
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header>
        <h1 className="text-xl font-semibold">Bug Reproduction Wizard</h1>
        <p className="text-sm text-muted-foreground">
          Génère un test unitaire qui échoue, reproduisant le bug décrit dans l&apos;artéfact Tuleap.
        </p>
      </header>

      <Card className="grid grid-cols-2 gap-3 p-4">
        <div>
          <Label>Artifact ID (bug)</Label>
          <Input value={artifactId} onChange={(e) => setArtifactId(e.target.value)} placeholder="1234" />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={saveToFile} onChange={(e) => setSaveToFile(e.target.checked)} />
            Écrire le test sur disque
          </label>
        </div>
        <div className="col-span-2">
          <Label>Dépôt cible</Label>
          <div className="flex gap-2">
            <Input value={repoPath} onChange={(e) => setRepoPath(e.target.value)} />
            <Button variant="outline" onClick={pickRepo}>Parcourir…</Button>
          </div>
        </div>
        <div className="col-span-2">
          <Button onClick={generate} disabled={busy || !artifactId || !repoPath}>
            {busy ? 'Génération…' : 'Générer le test'}
          </Button>
        </div>
      </Card>

      {error && <Card className="border-destructive p-3 text-sm text-destructive">{error}</Card>}

      {result && (
        <Card className="p-4 text-sm">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="font-semibold">Test proposé</h2>
            <Badge variant="outline">{result.testLanguage}</Badge>
            <code className="text-xs text-muted-foreground">{result.testFileSuggested}</code>
          </div>
          <p className="mb-3 text-xs">{result.explanation}</p>
          <pre className="max-h-[400px] overflow-auto rounded bg-muted p-3 text-xs">{result.testCode}</pre>
        </Card>
      )}
    </div>
  )
}
