import type { Warning } from './warning-parser'

/** Render the warnings for one file as a compact, numbered list for the prompt. */
export function renderWarningList(warnings: Warning[]): string {
  return warnings
    .map((w, i) => {
      const loc = [w.line, w.column].filter((v) => v != null).join(':')
      const cat = w.category && w.category !== 'unknown' ? ` [${w.category}]` : ''
      return `${i + 1}. ligne ${loc || '?'}${cat} : ${w.message}`
    })
    .join('\n')
}

export type WarningFixPromptArgs = {
  fileName: string
  fileContent: string
  warnings: Warning[]
  /** Rendered call-graph context (the "code tree") for the file's functions. */
  contextText: string
}

/**
 * Build the system+user prompt asking the model to rewrite a single source file
 * so that the listed compiler warnings disappear, while changing nothing else.
 */
export function buildWarningFixPrompt(args: WarningFixPromptArgs): {
  system: string
  user: string
} {
  const system = [
    'Tu es un expert C/C++ chargé de corriger des warnings de compilation.',
    'Tu reçois un fichier source, la liste exacte des warnings à corriger, et du contexte (arbre des appels) pour comprendre les usages.',
    'Règles impératives :',
    "- Corrige UNIQUEMENT les warnings listés ; ne change rien d'autre.",
    "- Préserve scrupuleusement le comportement, l'API publique, les commentaires et la mise en forme du code non concerné.",
    "- N'introduis aucun nouveau warning ni aucune régression.",
    '- Réponds UNIQUEMENT avec le contenu COMPLET du fichier corrigé, sans blocs de code Markdown (pas de ```), sans explication.'
  ].join('\n')

  const user = [
    `FICHIER À CORRIGER (${args.fileName}) :`,
    args.fileContent,
    '',
    'WARNINGS À CORRIGER :',
    renderWarningList(args.warnings),
    '',
    '=== CONTEXTE (arbre de code, lecture seule) ===',
    args.contextText || '(aucun contexte supplémentaire)',
    '',
    'Renvoie maintenant le fichier complet corrigé.'
  ].join('\n')

  return { system, user }
}

/**
 * Strip an optional Markdown code fence from an LLM response so we keep the raw
 * source. Mirrors the test-generator's `extractCppBlock` tolerance.
 */
export function extractSourceBlock(raw: string): string {
  const text = raw.trim()
  const fence = /^```[a-zA-Z0-9_+-]*\n([\s\S]*?)\n```$/m.exec(text)
  if (fence && fence[1] != null) return fence[1].trim() + '\n'
  // Remove stray leading/trailing fence lines if the regex above didn't match.
  const stripped = text.replace(/^```[a-zA-Z0-9_+-]*\s*\n/, '').replace(/\n```\s*$/, '')
  return stripped.endsWith('\n') ? stripped : stripped + '\n'
}
