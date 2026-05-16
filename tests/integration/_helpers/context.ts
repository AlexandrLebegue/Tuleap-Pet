import { getIntegrationClient, getIntegrationEnv } from './client'

export type FieldIds = {
  titleFieldId: number
  descriptionFieldId: number | null
  statusFieldId: number
  linkFieldId: number
  statusNewBindValueId: number
  statusDoneBindValueId: number
  statusInProgressBindValueId: number | null
}

export type IntegrationContext = FieldIds & {
  projectId: number
  trackerId: number
}

let cached: IntegrationContext | null = null

/**
 * Résout les IDs des fields critiques du tracker cible en s'appuyant
 * sur les **semantics** Tuleap (title/status/description), ce qui rend
 * les tests indépendants du template XML utilisé.
 */
export async function getIntegrationContext(): Promise<IntegrationContext> {
  if (cached) return cached
  const env = getIntegrationEnv()
  const client = getIntegrationClient()
  const structure = await client.getTrackerFields(env.trackerId)

  // Le schema défensif fait passthrough() sur semantics — value_ids et la
  // sémantique 'description' sont accessibles via cast.
  type SemanticsRaw = {
    title?: { field_id: number }
    status?: { field_id: number; value_ids?: number[] }
    description?: { field_id: number }
  }
  const semantics = (structure.semantics ?? {}) as SemanticsRaw
  if (!semantics.title) throw new Error('[integration] semantic title manquante')
  if (!semantics.status) throw new Error('[integration] semantic status manquante')

  const titleFieldId = semantics.title.field_id
  const statusFieldId = semantics.status.field_id
  const descriptionFieldId = semantics.description?.field_id ?? null
  const openIds = new Set(semantics.status.value_ids ?? [])

  // Champ Links (art_link) — pas exposé en sémantique, on cherche par type.
  const linkField = (structure.fields ?? []).find((f) => f.type === 'art_link')
  if (!linkField) throw new Error('[integration] aucun champ art_link dans le tracker')

  // Bind values du status.
  const statusField = (structure.fields ?? []).find((f) => f.field_id === statusFieldId)
  if (!statusField || !statusField.values || statusField.values.length === 0) {
    throw new Error('[integration] field status sans bind values')
  }
  const openValue = statusField.values.find((v) => openIds.has(v.id)) ?? statusField.values[0]!
  const closedValue =
    statusField.values.find((v) => !openIds.has(v.id) && v.id !== openValue.id) ??
    statusField.values[statusField.values.length - 1]!
  const inProgressValue =
    statusField.values.find(
      (v) => openIds.has(v.id) && v.id !== openValue.id
    ) ?? null

  cached = {
    projectId: env.projectId,
    trackerId: env.trackerId,
    titleFieldId,
    descriptionFieldId,
    statusFieldId,
    linkFieldId: linkField.field_id,
    statusNewBindValueId: openValue.id,
    statusDoneBindValueId: closedValue.id,
    statusInProgressBindValueId: inProgressValue?.id ?? null
  }
  return cached
}

/** Marque un artefact comme fermé pour signaler aux humains qu'il a été créé par la CI. */
export async function closeArtifactSafely(artifactId: number): Promise<void> {
  const ctx = await getIntegrationContext()
  const client = getIntegrationClient()
  try {
    await client.updateArtifactStatus({
      artifactId,
      statusFieldId: ctx.statusFieldId,
      statusBindValueId: ctx.statusDoneBindValueId
    })
  } catch {
    /* best-effort cleanup */
  }
}

/** Suffixe un titre avec un tag de run unique pour faciliter la trace. */
export function tagTitle(base: string): string {
  const tag = process.env.GITHUB_SHA?.slice(0, 7) ?? `local-${Date.now()}`
  return `[ci-run-${tag}] ${base}`
}
