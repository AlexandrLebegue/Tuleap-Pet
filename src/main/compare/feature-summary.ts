import { resolveLlmProvider } from '../llm'
import { debugError, debugLog } from '../logger'
import {
  sanitizeLlmText,
  statsLine,
  breakdownLine,
  commitsBlock,
  chunkSourceSample,
  heuristicSummary,
  hasNothingToSummarize,
  MIN_USEFUL,
  type SummaryInput
} from './summary-utils'

export type { SummaryInput } from './summary-utils'
export { sanitizeLlmText, heuristicSummary, chunkSourceSample } from './summary-utils'

// Char budgets tuned for ~30B local models (Qwen3-class, 32K ctx): keep prompts
// well within context while leaving room for the answer.
const QUICK_SAMPLE_CHARS = 9_000
const DETAIL_CHUNK_CHARS = 7_000
const MAX_DETAIL_CHUNKS = 10

// ─── Robust LLM call ──────────────────────────────────────────────────────────

type GenOpts = { temperature?: number; maxOutputTokens?: number; retries?: number }

// Qwen3 (and several other local "hybrid reasoning" models) honour `/no_think`
// to disable the <think> phase. Without it the model can burn its entire output
// budget reasoning and return an empty answer — the original "_Résumé IA vide_"
// bug. Harmless to models that don't recognise it. The sanitiser + deterministic
// fallback remain the safety net for everything else.
const NO_THINK_HINT = ' /no_think'

/**
 * Single robust generation: forces non-thinking mode, sanitises the output, and
 * retries with a firmer instruction when the model returns an empty/too-short
 * answer. Returns '' if every attempt fails (caller falls back deterministically).
 */
async function robustGenerate(system: string, user: string, opts: GenOpts = {}): Promise<string> {
  const retries = opts.retries ?? 2
  let provider: ReturnType<typeof resolveLlmProvider>
  try {
    provider = resolveLlmProvider()
  } catch (err) {
    debugError('[compare] no LLM provider: %s', err instanceof Error ? err.message : String(err))
    return ''
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const userMsg =
      (attempt === 0
        ? user
        : `${user}\n\n[IMPORTANT] Réponds directement en Markdown, en français. N'émets AUCUN bloc <think> ni préambule. Commence par un titre de section.`) +
      NO_THINK_HINT
    try {
      const res = await provider.generate({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMsg }
        ],
        temperature: opts.temperature ?? 0.2,
        maxOutputTokens: opts.maxOutputTokens ?? 1500,
        thinking: false
      })
      const text = sanitizeLlmText(res.text)
      if (text.length >= MIN_USEFUL) return text
      debugLog(
        '[compare] empty/short summary (attempt %d), finishReason=%s',
        attempt,
        res.finishReason
      )
    } catch (err) {
      debugError(
        '[compare] generate failed (attempt %d): %s',
        attempt,
        err instanceof Error ? err.message : String(err)
      )
    }
  }
  return ''
}

// ─── Quick summary (single call) ──────────────────────────────────────────────

const QUICK_SYSTEM =
  'Tu es un expert en revue de code (C/C++, embarqué, FPGA). Tu résumes les ' +
  'différences entre deux branches de façon factuelle, concise et structurée en ' +
  'Markdown français. Tu t’appuies EN PRIORITÉ sur les messages de commit et les ' +
  'fichiers source modifiés. Tu IGNORES les fichiers générés (projets MSBuild ' +
  '.vcxproj/.filters, lockfiles, dépendances vendored). Tu ne produis jamais de ' +
  'bloc de réflexion : tu donnes directement le résultat.'

function quickPrompt(input: SummaryInput): string {
  const sample = input.sourceSample.slice(0, QUICK_SAMPLE_CHARS)
  const sampleTrunc = input.sourceSampleTruncated || input.sourceSample.length > QUICK_SAMPLE_CHARS
  return `Compare \`${input.base}\` (base) → \`${input.compare}\` (nouveautés).

${statsLine(input)}
${breakdownLine(input.breakdown)}

# Messages de commit (${input.commits.length})
${commitsBlock(input.commits)}

# Extrait du code source modifié${sampleTrunc ? ' (échantillon tronqué)' : ''}
${sample.trim() ? '```diff\n' + sample + '\n```' : '_(aucun changement de code source — uniquement des fichiers générés/config)_'}

Rédige un compte-rendu **court** en Markdown :

## ✨ Nouvelles fonctionnalités
Puces des fonctionnalités/comportements ajoutés (déduits surtout des commits et du code source).

## 🔧 Autres changements
Refactors, corrections, configs, build.

Si l'extrait de code est vide ou non pertinent, appuie-toi sur les messages de commit et la répartition des fichiers. N'invente rien d'non étayé. Sois factuel.`
}

export async function summarizeQuick(input: SummaryInput): Promise<string> {
  if (hasNothingToSummarize(input)) return heuristicSummary(input)
  const text = await robustGenerate(QUICK_SYSTEM, quickPrompt(input), {
    temperature: 0.2,
    maxOutputTokens: 1300
  })
  return text || heuristicSummary(input)
}

// ─── Detailed summary (map-reduce, scales to large infra) ──────────────────────

const MAP_SYSTEM =
  'Tu es un expert en revue de code. On te donne un fragment de diff (fichiers ' +
  'source). Liste de façon factuelle les changements concrets : fichiers/fonctions ' +
  'touchés et ce qu’ils font. Puces courtes, en français. Pas de bloc de réflexion.'

const REDUCE_SYSTEM =
  'Tu es un expert en revue de code. On te donne des notes de revue partielles et ' +
  'la liste des commits d’une branche. Produis une synthèse détaillée, structurée ' +
  'et dédupliquée en Markdown français. Pas de bloc de réflexion.'

export async function summarizeDetailed(input: SummaryInput): Promise<string> {
  if (hasNothingToSummarize(input)) return heuristicSummary(input)

  const chunks = chunkSourceSample(input.sourceSample, DETAIL_CHUNK_CHARS, MAX_DETAIL_CHUNKS)
  const totalBlocks =
    (input.sourceSample.match(/\n### /g)?.length ?? 0) + (input.sourceSample ? 1 : 0)
  const chunksTruncated = input.sourceSampleTruncated || totalBlocks > chunks.length

  // Map: summarise each chunk independently (sequential to respect rate limits).
  const partials: string[] = []
  for (let i = 0; i < chunks.length; i++) {
    const note = await robustGenerate(
      MAP_SYSTEM,
      `Fragment ${i + 1}/${chunks.length} du diff :\n\n\`\`\`diff\n${chunks[i]}\n\`\`\`\n\nListe les changements concrets (puces).`,
      { temperature: 0.1, maxOutputTokens: 600, retries: 1 }
    )
    if (note) partials.push(note)
  }

  // If mapping produced nothing usable, fall back to the quick (commits-driven) path.
  if (partials.length === 0) {
    const quick = await robustGenerate(QUICK_SYSTEM, quickPrompt(input), {
      temperature: 0.2,
      maxOutputTokens: 1500
    })
    return quick || heuristicSummary(input)
  }

  // Reduce: merge partial notes + commits into a structured report.
  const reducePrompt = `Compare \`${input.base}\` → \`${input.compare}\`. ${statsLine(input)}.
${breakdownLine(input.breakdown)}

# Notes de revue par fragment${chunksTruncated ? ' (couverture partielle — très gros changement)' : ''}
${partials.map((p, i) => `## Fragment ${i + 1}\n${p}`).join('\n\n')}

# Messages de commit (${input.commits.length})
${commitsBlock(input.commits)}

Produis une **synthèse détaillée** en Markdown, sans répétitions :

## ✨ Nouvelles fonctionnalités
## 🔧 Refactors & corrections
## 📂 Portée & impact
${chunksTruncated ? '\n> ⚠️ Couverture partielle : le diff est très volumineux, certains fichiers n’ont pas été analysés en détail.\n' : ''}
Regroupe par thème/feature, cite les fichiers concernés, reste factuel.`

  const reduced = await robustGenerate(REDUCE_SYSTEM, reducePrompt, {
    temperature: 0.25,
    maxOutputTokens: 2200
  })
  return reduced || `${partials.join('\n\n')}\n\n---\n${heuristicSummary(input)}`
}

/** Back-compat alias used by the compare backends (quick path). */
export async function summarizeBranchDiff(input: SummaryInput): Promise<string> {
  return summarizeQuick(input)
}
