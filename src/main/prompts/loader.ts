/**
 * Loader for the versioned prompt templates stored in docs/prompts/.
 *
 * Vite turns the `?raw` import into a string literal at build time, so the
 * Markdown ships with the bundled main process and we never read from disk
 * at runtime — this also keeps the templates immutable for end users.
 */
import sprintReviewSource from '../../../docs/prompts/sprint_review.md?raw'
import adminSummarySource from '../../../docs/prompts/admin_summary.md?raw'

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
  admin_summary: buildTemplate('admin_summary', adminSummarySource)
}

export function getPrompt(name: keyof typeof templates): PromptTemplate {
  const tpl = templates[name]
  if (!tpl) throw new Error(`Prompt inconnu : ${String(name)}`)
  return tpl
}

export function listPromptNames(): string[] {
  return Object.keys(templates)
}
