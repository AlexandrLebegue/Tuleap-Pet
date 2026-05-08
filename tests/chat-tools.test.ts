import { describe, expect, it } from 'vitest'
import { buildTuleapTools } from '../src/main/llm/tools'

describe('buildTuleapTools', () => {
  const tools = buildTuleapTools()

  it('exposes the documented tool names', () => {
    expect(Object.keys(tools).sort()).toEqual(
      [
        'get_artifact',
        'get_self',
        'list_artifacts',
        'list_milestones',
        'list_projects',
        'list_trackers'
      ].sort()
    )
  })

  it('attaches a description and an inputSchema to every tool', () => {
    for (const [name, t] of Object.entries(tools)) {
      const tool = t as { description?: string; inputSchema?: unknown }
      expect(tool.description, `description on ${name}`).toBeDefined()
      expect(tool.inputSchema, `inputSchema on ${name}`).toBeDefined()
    }
  })

  it('rejects malformed inputs through inputSchema.safeParse', () => {
    const get = tools['get_artifact'] as { inputSchema: { safeParse: (v: unknown) => { success: boolean } } }
    expect(get.inputSchema.safeParse({ id: 'abc' }).success).toBe(false)
    expect(get.inputSchema.safeParse({ id: -1 }).success).toBe(false)
    expect(get.inputSchema.safeParse({ id: 1234 }).success).toBe(true)
  })

  it('list_milestones accepts only the documented status values', () => {
    const ms = tools['list_milestones'] as { inputSchema: { safeParse: (v: unknown) => { success: boolean } } }
    expect(ms.inputSchema.safeParse({ status: 'open' }).success).toBe(true)
    expect(ms.inputSchema.safeParse({ status: 'pending' }).success).toBe(false)
    expect(ms.inputSchema.safeParse({}).success).toBe(true)
  })
})
