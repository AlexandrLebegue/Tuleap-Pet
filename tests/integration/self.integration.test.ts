import { describe, it, expect } from 'vitest'
import { getIntegrationClient } from './_helpers/client'

describe('TuleapClient.getSelf [integration]', () => {
  it('retourne le user de bootstrap (admin par défaut)', async () => {
    const client = getIntegrationClient()
    const me = await client.getSelf()
    expect(me.username).toBe(process.env.TULEAP_CI_USER ?? 'admin')
    expect(me.id).toBeGreaterThan(0)
    expect(me.uri).toMatch(/users\/\d+/)
  })
})
