import { ipcMain } from 'electron'
import { execa } from 'execa'
import { buildTuleapClient, mapArtifactDetail } from '../tuleap'
import { resolveLlmProvider } from '../llm'
import { formatArtifactContext } from '../coder/context'
import { audit } from '../store/db'
import { writeFile } from 'fs/promises'
import { join } from 'path'

export type BugReproLanguage = 'typescript' | 'python' | 'cpp' | 'java' | 'go' | 'unknown'

export type BugReproResult =
  | {
      ok: true
      testLanguage: BugReproLanguage
      testFileSuggested: string
      testCode: string
      explanation: string
    }
  | { ok: false; error: string }

function detectLanguageFromRepo(filesProbe: string[]): BugReproLanguage {
  const flat = filesProbe.join(' ')
  if (/\.tsx?\b|package\.json/.test(flat)) return 'typescript'
  if (/\.py\b|pyproject\.toml|setup\.py/.test(flat)) return 'python'
  if (/\.cpp|\.cc|CMakeLists/.test(flat)) return 'cpp'
  if (/\.java|pom\.xml|build\.gradle/.test(flat)) return 'java'
  if (/\.go|go\.mod/.test(flat)) return 'go'
  return 'unknown'
}

export function registerBugReproHandlers(): void {
  ipcMain.handle(
    'bug-repro:generate',
    async (
      _evt,
      args: { artifactId: number; repoPath: string; saveToFile?: boolean }
    ): Promise<BugReproResult> => {
      try {
        const client = await buildTuleapClient()
        const raw = await client.getArtifact(args.artifactId)
        const detail = mapArtifactDetail(raw)
        const contextMarkdown = formatArtifactContext(detail)

        let filesProbe: string[] = []
        try {
          const { stdout } = await execa('git', ['ls-files'], { cwd: args.repoPath, maxBuffer: 2_000_000 })
          filesProbe = stdout.split('\n').filter(Boolean).slice(0, 200)
        } catch {
          filesProbe = []
        }
        const language = detectLanguageFromRepo(filesProbe)

        const provider = resolveLlmProvider()
        const prompt = `Tu es un développeur senior. Voici un bug Tuleap et la liste partielle des fichiers du repo cible.

Génère un **test unitaire qui échoue** reproduisant le bug, dans le langage détecté.

# Contexte du ticket
${contextMarkdown}

# Langage détecté : ${language}

# Fichiers du repo (échantillon)
${filesProbe.slice(0, 60).join('\n')}

Réponds STRICTEMENT en JSON :
{
  "filename": "<chemin/fichier_test.ext>",
  "testCode": "<code complet du fichier>",
  "explanation": "<paragraphe markdown expliquant ce que le test démontre et comment le lancer>"
}`
        const llm = await provider.generate({
          messages: [
            { role: 'system', content: 'Tu réponds toujours en JSON valide, sans markdown autour.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          maxOutputTokens: 3000
        })
        const text = llm.text.trim().replace(/^```(?:json)?\s*|```$/g, '')
        let parsed: { filename: string; testCode: string; explanation: string }
        try {
          parsed = JSON.parse(text)
        } catch {
          return { ok: false, error: 'Parsing LLM échoué — le modèle n\'a pas renvoyé un JSON valide.' }
        }

        if (args.saveToFile) {
          await writeFile(join(args.repoPath, parsed.filename), parsed.testCode, 'utf8').catch(() => {})
        }
        audit('bug-repro.generate', String(args.artifactId), { lang: language })
        return {
          ok: true,
          testLanguage: language,
          testFileSuggested: parsed.filename,
          testCode: parsed.testCode,
          explanation: parsed.explanation
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
}
