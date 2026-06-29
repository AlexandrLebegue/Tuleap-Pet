import { resolveLlmProvider } from '../llm'
import { getLlmProvider, getLlmModel, getLocalModel } from '../store/config'
import { debugError, debugLog } from '../logger'
import {
  sanitizeLlmText,
  statsLine,
  breakdownLine,
  commitsBlock,
  chunkSourceSample,
  heuristicSummary,
  hasNothingToSummarize,
  explainEmptyResponse,
  MIN_USEFUL,
  type SummaryInput
} from './summary-utils'
import type { SummaryDiagnostics, SummaryAttempt } from '@shared/types'

export type { SummaryInput } from './summary-utils'
export { sanitizeLlmText, heuristicSummary, chunkSourceSample } from './summary-utils'

export type SummaryResult = { summary: string; diagnostics: SummaryDiagnostics }

// Char budgets tuned for ~30B local models (Qwen3-class, 32K ctx): keep prompts
// well within context while leaving room for the answer.
const QUICK_SAMPLE_CHARS = 9_000
const DETAIL_CHUNK_CHARS = 7_000
const MAX_DETAIL_CHUNKS = 10

// ─── Robust LLM call (with diagnostics) ───────────────────────────────────────

type GenOpts = { temperature?: number; maxOutputTokens?: number; retries?: number }

/** Hard cap on a single LLM call so a slow/hung local model can never block forever. */
const LLM_CALL_TIMEOUT_MS = 120_000

/** Race a generation against a timeout; the timer is always cleared. */
function generateWithTimeout(
  provider: ReturnType<typeof resolveLlmProvider>,
  req: Parameters<ReturnType<typeof resolveLlmProvider>['generate']>[0],
  ms: number
): Promise<Awaited<ReturnType<ReturnType<typeof resolveLlmProvider>['generate']>>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`délai LLM dépassé (${Math.round(ms / 1000)} s)`)),
      ms
    )
  })
  return Promise.race([provider.generate(req), timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

const NO_THINK_HINT = ' /no_think'

function newDiagnostics(): SummaryDiagnostics {
  const provider = getLlmProvider()
  return {
    provider,
    model: provider === 'local' ? getLocalModel() : getLlmModel(),
    usedFallback: false,
    attempts: []
  }
}

/**
 * Single robust generation: forces non-thinking mode, sanitises the output,
 * retries on empty/short answers, and records every attempt into `diag`.
 * Returns '' if every attempt fails (caller falls back deterministically).
 */
async function robustGenerate(
  system: string,
  user: string,
  opts: GenOpts,
  diag: SummaryDiagnostics,
  phase: string
): Promise<string> {
  const retries = opts.retries ?? 2
  let provider: ReturnType<typeof resolveLlmProvider>
  try {
    provider = resolveLlmProvider()
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    debugError('[compare] no LLM provider: %s', detail)
    diag.attempts.push({ phase, outcome: 'no-provider', detail })
    return ''
  }
  diag.provider = provider.name

  for (let attempt = 0; attempt <= retries; attempt++) {
    const userMsg =
      (attempt === 0
        ? user
        : `${user}\n\n[IMPORTANT] Réponds directement en Markdown, en français. N'émets AUCUN bloc <think> ni préambule. Commence par un titre de section.`) +
      NO_THINK_HINT
    try {
      const res = await generateWithTimeout(
        provider,
        {
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userMsg }
          ],
          temperature: opts.temperature ?? 0.2,
          maxOutputTokens: opts.maxOutputTokens ?? 1500,
          thinking: false
        },
        LLM_CALL_TIMEOUT_MS
      )
      if (res.model) diag.model = res.model
      const text = sanitizeLlmText(res.text)
      const base: SummaryAttempt = {
        phase,
        outcome: 'ok',
        finishReason: res.finishReason,
        rawChars: res.text.length,
        cleanChars: text.length
      }
      if (text.length >= MIN_USEFUL) {
        diag.attempts.push(base)
        return text
      }
      diag.attempts.push({
        ...base,
        outcome: text.length === 0 ? 'empty' : 'too-short',
        detail: explainEmptyResponse(res.text, text, res.finishReason)
      })
      debugLog(
        '[compare] %s empty/short (attempt %d), finishReason=%s rawChars=%d',
        phase,
        attempt,
        res.finishReason,
        res.text.length
      )
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      debugError('[compare] %s generate failed (attempt %d): %s', phase, attempt, detail)
      diag.attempts.push({ phase, outcome: 'error', detail })
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

export async function summarizeQuick(input: SummaryInput): Promise<SummaryResult> {
  const diagnostics = newDiagnostics()
  if (hasNothingToSummarize(input)) {
    diagnostics.usedFallback = true
    return { summary: heuristicSummary(input), diagnostics }
  }
  const text = await robustGenerate(
    QUICK_SYSTEM,
    quickPrompt(input),
    { temperature: 0.2, maxOutputTokens: 1300 },
    diagnostics,
    'quick'
  )
  if (text) return { summary: text, diagnostics }
  diagnostics.usedFallback = true
  return { summary: heuristicSummary(input), diagnostics }
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

export async function summarizeDetailed(input: SummaryInput): Promise<SummaryResult> {
  const diagnostics = newDiagnostics()
  if (hasNothingToSummarize(input)) {
    diagnostics.usedFallback = true
    return { summary: heuristicSummary(input), diagnostics }
  }

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
      { temperature: 0.1, maxOutputTokens: 600, retries: 1 },
      diagnostics,
      'map'
    )
    if (note) partials.push(note)
  }

  // If mapping produced nothing usable, fall back to the quick (commits-driven) path.
  if (partials.length === 0) {
    const quick = await robustGenerate(
      QUICK_SYSTEM,
      quickPrompt(input),
      { temperature: 0.2, maxOutputTokens: 1500 },
      diagnostics,
      'quick'
    )
    if (quick) return { summary: quick, diagnostics }
    diagnostics.usedFallback = true
    return { summary: heuristicSummary(input), diagnostics }
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

  const reduced = await robustGenerate(
    REDUCE_SYSTEM,
    reducePrompt,
    { temperature: 0.25, maxOutputTokens: 2200 },
    diagnostics,
    'reduce'
  )
  if (reduced) return { summary: reduced, diagnostics }
  // Reduce failed but we have map notes — present them rather than nothing.
  return { summary: `${partials.join('\n\n')}\n\n---\n${heuristicSummary(input)}`, diagnostics }
}

/** Back-compat alias used by the compare backends (quick path). */
export async function summarizeBranchDiff(input: SummaryInput): Promise<SummaryResult> {
  return summarizeQuick(input)
}
