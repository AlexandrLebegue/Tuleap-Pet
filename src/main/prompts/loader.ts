/**
 * Loader for the versioned prompt templates stored in docs/prompts/.
 *
 * Vite turns the `?raw` import into a string literal at build time, so the
 * Markdown ships with the bundled main process and we never read from disk
 * at runtime — this also keeps the templates immutable for end users.
 */
import sprintReviewSource from '../../../docs/prompts/sprint_review.md?raw'
import adminSummarySource from '../../../docs/prompts/admin_summary.md?raw'
import sprintSummarySource from '../../../docs/prompts/sprint_summary.md?raw'
import slideTitreSource from '../../../docs/prompts/slide_titre.md?raw'
import slideContexteSource from '../../../docs/prompts/slide_contexte.md?raw'
import slideEquipeSource from '../../../docs/prompts/slide_equipe.md?raw'
import slideLivrablesSource from '../../../docs/prompts/slide_livrables.md?raw'
import slideAvancementSource from '../../../docs/prompts/slide_avancement.md?raw'
import slideIndicateursSource from '../../../docs/prompts/slide_indicateurs.md?raw'
import slideRisquesSource from '../../../docs/prompts/slide_risques.md?raw'
import slideSyntheseSource from '../../../docs/prompts/slide_synthese.md?raw'

export type PromptTemplate = {
  /** Logical name (matches the file basename). */
  name: string
  /** Raw Markdown source, useful for surfacing the template to power users. */
  source: string
  /** Static portion of the system prompt (no interpolation expected). */
  system: string
  /** User prompt with `{{var}}` placeholders to interpolate. */
  userTemplate: string
}

const SYSTEM_MARKER = '---system---'
const USER_MARKER = '---user---'

function splitTemplate(source: string): { system: string; user: string } {
  const sysIdx = source.indexOf(SYSTEM_MARKER)
  const userIdx = source.indexOf(USER_MARKER)
  if (sysIdx < 0 || userIdx < 0 || userIdx < sysIdx) {
    throw new Error(
      `Prompt template invalide : marqueurs '${SYSTEM_MARKER}' et '${USER_MARKER}' attendus dans cet ordre.`
    )
  }
  const system = source.slice(sysIdx + SYSTEM_MARKER.length, userIdx).trim()
  const user = source.slice(userIdx + USER_MARKER.length).trim()
  return { system, user }
}

function buildTemplate(name: string, source: string): PromptTemplate {
  const { system, user } = splitTemplate(source)
  return { name, source, system, userTemplate: user }
}

export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key]
    if (value === undefined) return `{{${key}}}`
    return String(value)
  })
}

const templates: Record<string, PromptTemplate> = {
  sprint_review: buildTemplate('sprint_review', sprintReviewSource),
  admin_summary: buildTemplate('admin_summary', adminSummarySource),
  sprint_summary: buildTemplate('sprint_summary', sprintSummarySource),
  slide_titre: buildTemplate('slide_titre', slideTitreSource),
  slide_contexte: buildTemplate('slide_contexte', slideContexteSource),
  slide_equipe: buildTemplate('slide_equipe', slideEquipeSource),
  slide_livrables: buildTemplate('slide_livrables', slideLivrablesSource),
  slide_avancement: buildTemplate('slide_avancement', slideAvancementSource),
  slide_indicateurs: buildTemplate('slide_indicateurs', slideIndicateursSource),
  slide_risques: buildTemplate('slide_risques', slideRisquesSource),
  slide_synthese: buildTemplate('slide_synthese', slideSyntheseSource)
}

export function getPrompt(name: string): PromptTemplate {
  const tpl = templates[name]
  if (!tpl) throw new Error(`Prompt inconnu : ${name}`)
  return tpl
}

export function listPromptNames(): string[] {
  return Object.keys(templates)
}
