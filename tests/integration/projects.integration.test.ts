import { describe, it, expect } from 'vitest'
import { getIntegrationClient, getIntegrationEnv } from './_helpers/client'

describe('Projects & trackers read [integration]', () => {
  const client = getIntegrationClient()
  const env = getIntegrationEnv()

  it('listProjects contient le projet ci-test', async () => {
    const page = await client.listProjects({ limit: 50 })
    expect(page.items.length).toBeGreaterThan(0)
    const found = page.items.find((p) => p.shortname === 'ci-test')
    expect(found, 'projet ci-test absent').toBeDefined()
    expect(found?.id).toBe(env.projectId)
  })

  it('listProjects?query=ci-test retourne le projet ciblé', async () => {
    const page = await client.listProjects({ query: 'ci-test' })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.shortname).toBe('ci-test')
  })

  it('getProject retourne le label complet', async () => {
    const project = await client.getProject(env.projectId)
    expect(project.id).toBe(env.projectId)
    expect(project.shortname).toBe('ci-test')
    expect(project.label.length).toBeGreaterThan(0)
  })

  it('listTrackers contient le tracker Stories', async () => {
    const page = await client.listTrackers(env.projectId)
    const stories = page.items.find((t) => t.id === env.trackerId)
    expect(stories, 'tracker Stories absent').toBeDefined()
  })

  it('listMilestones ne crash pas même si vide', async () => {
    const page = await client.listMilestones(env.projectId, { status: 'all' })
    expect(Array.isArray(page.items)).toBe(true)
    expect(typeof page.total).toBe('number')
  })
})
