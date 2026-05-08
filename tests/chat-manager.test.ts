import Database from 'better-sqlite3'
import { describe, expect, it, beforeEach, vi } from 'vitest'

/**
 * The chat manager uses getDatabase() from store/db.ts which expects an
 * Electron app context. We mock the underlying module with an in-memory
 * better-sqlite3 instance and apply migration #2 manually.
 */

vi.mock('../src/main/store/db', () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE conversations (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      title        TEXT NOT NULL,
      created_ts   INTEGER NOT NULL,
      updated_ts   INTEGER NOT NULL,
      model        TEXT,
      project_id   INTEGER
    );
    CREATE TABLE messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL,
      content         TEXT NOT NULL,
      tool_payload    TEXT,
      created_ts      INTEGER NOT NULL
    );
  `)
  return {
    getDatabase: () => db,
    audit: () => {}
  }
})

const mgr = await import('../src/main/chat/manager')

describe('chat manager (in-memory)', () => {
  beforeEach(() => {
    // wipe between tests
    const db = (mgr as unknown as { __db?: Database.Database })
    void db
  })

  it('createConversation stores title + timestamps', () => {
    const conv = mgr.createConversation({ title: 'Demo', model: 'm', projectId: 7 })
    expect(conv.id).toBeGreaterThan(0)
    expect(conv.title).toBe('Demo')
    expect(conv.model).toBe('m')
    expect(conv.projectId).toBe(7)
    expect(conv.createdAt).toBeLessThanOrEqual(Date.now())
  })

  it('addMessage appends rows and updates the conversation timestamp', () => {
    const conv = mgr.createConversation({ title: 'T' })
    const u = mgr.addMessage({ conversationId: conv.id, role: 'user', content: 'hi' })
    const a = mgr.addMessage({ conversationId: conv.id, role: 'assistant', content: '' })
    const all = mgr.listMessages(conv.id)
    expect(all.map((m) => m.id)).toEqual([u.id, a.id])
    expect(all[1]?.role).toBe('assistant')
  })

  it('appendToolEvent persists JSON arrays of events', () => {
    const conv = mgr.createConversation({})
    const a = mgr.addMessage({ conversationId: conv.id, role: 'assistant', content: '' })
    mgr.appendToolEvent(a.id, {
      kind: 'call',
      name: 'get_self',
      toolCallId: 'tc-1',
      args: {}
    })
    mgr.appendToolEvent(a.id, {
      kind: 'result',
      name: 'get_self',
      toolCallId: 'tc-1',
      result: { id: 1, username: 'alice' }
    })
    const reloaded = mgr.listMessages(conv.id).find((m) => m.id === a.id)!
    expect(reloaded.toolEvents).toHaveLength(2)
    expect(reloaded.toolEvents?.[0]?.kind).toBe('call')
    expect(reloaded.toolEvents?.[1]?.kind).toBe('result')
  })

  it('updateMessageContent rewrites the body in place', () => {
    const conv = mgr.createConversation({})
    const m = mgr.addMessage({ conversationId: conv.id, role: 'assistant', content: '' })
    mgr.updateMessageContent(m.id, 'Hello world')
    const reloaded = mgr.listMessages(conv.id).find((x) => x.id === m.id)!
    expect(reloaded.content).toBe('Hello world')
  })

  it('deleteConversation cascades to its messages', () => {
    const conv = mgr.createConversation({})
    mgr.addMessage({ conversationId: conv.id, role: 'user', content: 'hi' })
    mgr.deleteConversation(conv.id)
    expect(mgr.getConversation(conv.id)).toBeNull()
    expect(mgr.listMessages(conv.id)).toHaveLength(0)
  })

  it('renameConversation updates title and updated_ts but keeps id', () => {
    const conv = mgr.createConversation({ title: 'before' })
    const updated = mgr.renameConversation(conv.id, '   after  ')
    expect(updated?.title).toBe('after')
    expect(updated?.id).toBe(conv.id)
  })
})
