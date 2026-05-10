import { resolveLlmProvider } from '../llm'

export type CorrectorFile = { name: string; content: string }

export async function analyzeErrors(errorContent: string, iterationNumber = 0): Promise<string> {
  const provider = resolveLlmProvider()

  const prompt = `Analyse les erreurs de compilation suivantes et fournis :

1. Une classification des erreurs par type (erreurs de syntaxe, problèmes de types, variables non utilisées, etc.)
2. Une priorisation des problèmes à résoudre
3. Une analyse des causes probables

Note : Ceci est l'itération #${iterationNumber + 1} de correction. Si des erreurs persistent malgré des corrections précédentes, porte une attention particulière à ces problèmes récurrents.

Erreurs à analyser :
${errorContent}

Format attendu : fournis ton analyse sous forme de sections claires avec des titres.`

  const result = await provider.generate({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxOutputTokens: 4096
  })

  return result.text
}

export async function correctFile(
  filename: string,
  content: string,
  errorContent: string,
  errorAnalysis: string,
  iterationNumber = 0,
  previousContent?: string
): Promise<string> {
  const provider = resolveLlmProvider()

  const previousInfo = previousContent
    ? `\nAttention : Ce fichier a déjà été corrigé lors d'une itération précédente. Tes corrections actuelles doivent s'appliquer à cette version déjà corrigée, PAS au code original.\n`
    : ''

  const baseContent = previousContent ?? content

  const prompt = `Tu es un expert en correction de code. Utilise cette analyse d'erreurs pour corriger précisément le fichier suivant :

ANALYSE DES ERREURS :
${errorAnalysis}

FICHIER À CORRIGER (${filename}):
${baseContent}

MESSAGES D'ERREUR :
${errorContent}

ITÉRATION : #${iterationNumber + 1}
${previousInfo}

Réponds UNIQUEMENT avec le code corrigé. Conserve scrupuleusement tous les commentaires originaux et la structure du code.
Ne mets pas les corrections entre blocs de code (\`\`\`), je veux directement le contenu corrigé.

IMPORTANT : Si le fichier ne nécessite pas de correction (s'il n'est pas mentionné dans les messages d'erreur), retourne simplement le code tel quel sans modifications.`

  const result = await provider.generate({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    maxOutputTokens: 8192
  })

  return result.text
}

export async function generateCorrectionSummary(
  filename: string,
  originalContent: string,
  correctedContent: string,
  errorContent: string,
  iterationNumber = 0,
  previousSummary?: string
): Promise<string> {
  const provider = resolveLlmProvider()

  const fileMentioned = errorContent.includes(filename)
  const previousSummaryInfo = previousSummary
    ? `\nRÉSUMÉ DE LA CORRECTION PRÉCÉDENTE :\n${previousSummary}\n\nPrend en compte ce résumé précédent et concentre-toi sur les nouvelles corrections apportées dans cette itération.\n`
    : ''

  const prompt = `Pour le fichier ${filename}, compare le code original et le code corrigé, puis crée un résumé concis des modifications effectuées.

CODE ORIGINAL :
${originalContent}

CODE CORRIGÉ :
${correctedContent}

ERREURS :
${errorContent}

FICHIER MENTIONNÉ DANS LES ERREURS : ${fileMentioned ? 'Oui' : 'Non'}
ITÉRATION : #${iterationNumber + 1}
${previousSummaryInfo}

Ton résumé doit :
1. Si le fichier n'est pas mentionné dans les erreurs, indique simplement "Ce fichier ne nécessite pas de corrections dans cette itération."
2. Sinon, pour les fichiers qui ont été corrigés :
   a. Indiquer chaque modification effectuée dans cette itération
   b. Expliquer pourquoi cette modification était nécessaire
   c. Être organisé par type de correction
3. Ne pas dépasser 300 mots

Format : résumé concis et structuré par points.`

  const result = await provider.generate({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxOutputTokens: 1024
  })

  return result.text
}

export async function correctMultipleFiles(
  files: CorrectorFile[],
  errorContent: string,
  analysis: string
): Promise<{
  corrected: CorrectorFile[]
  summaries: { name: string; summary: string }[]
  errorAnalysis: string
}> {
  const corrected: CorrectorFile[] = []
  const summaries: { name: string; summary: string }[] = []

  for (const file of files) {
    const correctedContent = await correctFile(file.name, file.content, errorContent, analysis)
    corrected.push({ name: file.name, content: correctedContent })

    const summary = await generateCorrectionSummary(
      file.name,
      file.content,
      correctedContent,
      errorContent
    )
    summaries.push({ name: file.name, summary })
  }

  return { corrected, summaries, errorAnalysis: analysis }
}
