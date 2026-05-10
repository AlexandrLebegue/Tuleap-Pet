import path from 'node:path'
import { resolveLlmProvider } from '../llm'

const SUPPORTED_EXTENSIONS = ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx']

export function isTestGenSupported(filename: string): boolean {
  return SUPPORTED_EXTENSIONS.some((ext) => filename.toLowerCase().endsWith(ext))
}

export function testOutputFilename(sourceFilename: string): string {
  const base = path.basename(sourceFilename, path.extname(sourceFilename))
  return `test_${base}.c`
}

const SYSTEM_PROMPT = `Tu es un expert en tests unitaires C/C++.
Génère un fichier de tests unitaires complet pour le code source fourni.
Utilise le framework de test C le plus simple (assertions manuelles ou CUnit si approprié).
Retourne UNIQUEMENT le code C du fichier de test, sans explication ni balise markdown.
Inclus des tests pour les cas nominaux, les cas limites et les cas d'erreur.`

export async function generateTestsForFile(
  content: string,
  filename: string
): Promise<string> {
  if (!isTestGenSupported(filename)) {
    throw new Error(`Extension non supportée pour génération de tests: ${filename}`)
  }
  if (!content.trim()) {
    throw new Error(`Fichier vide: ${filename}`)
  }

  const provider = resolveLlmProvider()
  const userPrompt = `Génère un fichier de tests unitaires C pour le fichier source suivant.
Nom du fichier source: ${filename}
Le fichier de test doit s'appeler: ${testOutputFilename(filename)}

Code source:
\`\`\`c
${content}
\`\`\`

Retourne uniquement le code C du fichier de test.`

  const result = await provider.generate({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.2,
    maxOutputTokens: 8192
  })

  return result.text
}
