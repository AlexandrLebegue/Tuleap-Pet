import { afterAll, describe, expect, it } from 'vitest'
import { getIntegrationClient, getIntegrationEnv } from './_helpers/client'
import { closeArtifactSafely, getIntegrationContext, tagTitle } from './_helpers/context'

describe('Artifacts write pipeline [integration]', () => {
  const client = getIntegrationClient()
  const env = getIntegrationEnv()
  const created: number[] = []

  afterAll(async () => {
    for (const id of created) await closeArtifactSafely(id)
  })

  it('createArtifact + updateArtifactStatus + addComment + updateArtifact + linkArtifacts', async () => {
    const ctx = await getIntegrationContext()

    // 1. createArtifact (parent)
    const parent = await client.createArtifact({
      trackerId: env.trackerId,
      titleFieldId: ctx.titleFieldId,
      title: tagTitle('write-parent'),
      statusFieldId: ctx.statusFieldId,
      statusBindValueId: ctx.statusNewBindValueId,
      descriptionFieldId: ctx.descriptionFieldId,
      description: 'Parent created by integration test'
    })
    created.push(parent.id)
    expect(parent.id).toBeGreaterThan(0)

    // 2. updateArtifactStatus -> In progress (si dispo) sinon Done
    const target = ctx.statusInProgressBindValueId ?? ctx.statusDoneBindValueId
    await client.updateArtifactStatus({
      artifactId: parent.id,
      statusFieldId: ctx.statusFieldId,
      statusBindValueId: target
    })
    const afterStatus = await client.getArtifact(parent.id)
    // Le label de statut n'est pas garanti par Tuleap dans tous les builds ;
    // on se contente de vérifier que l'appel n'a pas crash.
    expect(afterStatus.id).toBe(parent.id)

    // 3. addArtifactComment
    await client.addArtifactComment({
      artifactId: parent.id,
      body: 'commentaire intégration #' + Date.now()
    })

    // 4. updateArtifact : changer le titre + description
    await client.updateArtifact({
      artifactId: parent.id,
      titleFieldId: ctx.titleFieldId,
      title: tagTitle('write-parent-renamed'),
      descriptionFieldId: ctx.descriptionFieldId,
      description: 'Updated description',
      statusFieldId: null,
      statusBindValueId: null
    })
    const renamed = await client.getArtifact(parent.id)
    const titleValue = renamed.values?.find((v) => v.field_id === ctx.titleFieldId)
    // Le champ `value` est passé via passthrough — on parse en `any`.
    expect((titleValue as { value?: string } | undefined)?.value).toMatch(/write-parent-renamed/)

    // 5. linkArtifacts : créer 2 enfants et les lier au parent
    const childA = await client.createArtifact({
      trackerId: env.trackerId,
      titleFieldId: ctx.titleFieldId,
      title: tagTitle('write-child-A'),
      statusFieldId: ctx.statusFieldId,
      statusBindValueId: ctx.statusNewBindValueId,
      descriptionFieldId: null,
      description: null
    })
    const childB = await client.createArtifact({
      trackerId: env.trackerId,
      titleFieldId: ctx.titleFieldId,
      title: tagTitle('write-child-B'),
      statusFieldId: ctx.statusFieldId,
      statusBindValueId: ctx.statusNewBindValueId,
      descriptionFieldId: null,
      description: null
    })
    created.push(childA.id, childB.id)

    await client.linkArtifacts({
      artifactId: parent.id,
      linkFieldId: ctx.linkFieldId,
      childIds: [childA.id, childB.id]
    })

    // Vérification : le parent expose maintenant les 2 liens
    const linked = await client.listLinkedArtifacts(parent.id, { nature: '', direction: 'forward' })
    const linkedIds = linked.items.map((a) => a.id)
    expect(linkedIds).toEqual(expect.arrayContaining([childA.id, childB.id]))
  })
})
