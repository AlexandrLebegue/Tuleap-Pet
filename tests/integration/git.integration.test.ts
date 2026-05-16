import { describe, expect, it } from 'vitest'
import { getIntegrationClient, getIntegrationEnv } from './_helpers/client'

describe('Git read [integration]', () => {
  const client = getIntegrationClient()
  const env = getIntegrationEnv()

  it('listGitRepositories accepte les deux shapes (array ou {repositories})', async () => {
    // Le projet template active le service git mais ne crée aucun repo.
    // On valide juste que la réponse parse (items vide acceptable) et que
    // les schémas Zod tolèrent les deux formes (array vs wrappé).
    const page = await client.listGitRepositories(env.projectId)
    expect(Array.isArray(page.items)).toBe(true)
    expect(typeof page.total).toBe('number')
  })
})
