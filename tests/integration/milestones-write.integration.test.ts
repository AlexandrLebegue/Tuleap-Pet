import { describe, expect, it } from 'vitest'
import { getIntegrationClient, getIntegrationEnv } from './_helpers/client'
import { getIntegrationContext } from './_helpers/context'

/**
 * Tests milestones write — désactivés par défaut car ils nécessitent un tracker
 * "Sprints" + le plugin AgileDashboard côté projet (le template XML active le
 * service mais ne crée pas de tracker de milestones). Activé via la variable
 * d'env TULEAP_RUN_MILESTONE_TESTS=1 quand un opérateur a configuré la milestone
 * manuellement, ou quand on enrichira le template plus tard.
 */
const shouldRun = process.env.TULEAP_RUN_MILESTONE_TESTS === '1'

describe.skipIf(!shouldRun)('Milestones write [integration]', () => {
  const client = getIntegrationClient()
  const env = getIntegrationEnv()

  it('liste les milestones du projet et leur contenu', async () => {
    const ctx = await getIntegrationContext()
    expect(ctx.projectId).toBe(env.projectId)
    const milestones = await client.listMilestones(env.projectId, { status: 'all' })
    expect(Array.isArray(milestones.items)).toBe(true)
    if (milestones.items.length === 0) return
    const first = milestones.items[0]!
    const content = await client.listMilestoneContent(first.id)
    expect(Array.isArray(content.items)).toBe(true)
  })
})
