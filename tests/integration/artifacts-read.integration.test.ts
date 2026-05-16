import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getIntegrationClient, getIntegrationEnv } from './_helpers/client'
import { closeArtifactSafely, getIntegrationContext, tagTitle } from './_helpers/context'

describe('Artifacts read [integration]', () => {
  const client = getIntegrationClient()
  const env = getIntegrationEnv()
  const createdIds: number[] = []

  beforeAll(async () => {
    // On crée 2 artefacts pour avoir matière à lire.
    const ctx = await getIntegrationContext()
    for (let i = 0; i < 2; i++) {
      const { id } = await client.createArtifact({
        trackerId: env.trackerId,
        titleFieldId: ctx.titleFieldId,
        title: tagTitle(`read-seed-${i}`),
        statusFieldId: ctx.statusFieldId,
        statusBindValueId: ctx.statusNewBindValueId,
        descriptionFieldId: ctx.descriptionFieldId,
        description: `Seed artifact ${i}`
      })
      createdIds.push(id)
    }
  })

  afterAll(async () => {
    for (const id of createdIds) await closeArtifactSafely(id)
  })

  it('getTrackerFields expose les semantics title + status', async () => {
    const struct = await client.getTrackerFields(env.trackerId)
    const sem = (struct.semantics ?? {}) as {
      title?: { field_id: number }
      status?: { field_id: number; value_ids?: number[] }
    }
    expect(sem.title?.field_id).toBeGreaterThan(0)
    expect(sem.status?.field_id).toBeGreaterThan(0)
    expect((sem.status?.value_ids ?? []).length).toBeGreaterThan(0)
    expect((struct.fields ?? []).some((f) => f.type === 'art_link')).toBe(true)
  })

  it('listArtifacts retourne au moins les artefacts seedés', async () => {
    const page = await client.listArtifacts(env.trackerId, { limit: 50 })
    expect(page.items.length).toBeGreaterThanOrEqual(createdIds.length)
    expect(typeof page.total).toBe('number')
  })

  it('countArtifacts retourne un total cohérent', async () => {
    const total = await client.countArtifacts(env.trackerId)
    expect(total).not.toBeNull()
    expect(total ?? 0).toBeGreaterThanOrEqual(createdIds.length)
  })

  it('getArtifact retourne le détail complet du premier artefact seedé', async () => {
    const id = createdIds[0]!
    const detail = await client.getArtifact(id)
    expect(detail.id).toBe(id)
    expect(detail.values?.length ?? 0).toBeGreaterThan(0)
  })

  it('fetchAll paginé renvoie un tableau plat', async () => {
    const all = await client.fetchAll((offset) =>
      client.listArtifacts(env.trackerId, { limit: 10, offset })
    )
    expect(Array.isArray(all)).toBe(true)
    expect(all.length).toBeGreaterThanOrEqual(createdIds.length)
  })

  it('listLinkedArtifacts retourne une page (vide ou non) sans erreur', async () => {
    const id = createdIds[0]!
    const page = await client.listLinkedArtifacts(id)
    expect(Array.isArray(page.items)).toBe(true)
  })
})
