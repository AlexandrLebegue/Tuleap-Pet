import type Database from 'better-sqlite3'
import { getDatabase } from '../store/db'
import type {
  ChatConversation,
  ChatMessage,
  ChatRole,
  ChatToolEvent
} from '@shared/types'

type ConversationRow = {
  id: number
  title: string
  created_ts: number
  updated_ts: number
  model: string | null
  project_id: number | null
}

type MessageRow = {
  id: number
  conversation_id: number
  role: ChatRole
  content: string
  tool_payload: string | null
  created_ts: number
}

function rowToConversation(row: ConversationRow): ChatConversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_ts,
    updatedAt: row.updated_ts,
    model: row.model,
    projectId: row.project_id
  }
}

function rowToMessage(row: MessageRow): ChatMessage {
  let toolEvents: ChatToolEvent[] | undefined
  if (row.tool_payload) {
    try {
      const parsed = JSON.parse(row.tool_payload)
      if (Array.isArray(parsed)) toolEvents = parsed as ChatToolEvent[]
    } catch {
      /* ignore malformed payload */
    }
  }
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    toolEvents,
    createdAt: row.created_ts
  }
}

function db(): Database.Database {
  return getDatabase()
}

export function createConversation(opts: {
  title?: string
  model?: string | null
  projectId?: number | null
}): ChatConversation {
  const now = Date.now()
  const title = opts.title?.trim() || 'Nouvelle conversation'
  const result = db()
    .prepare(
      'INSERT INTO conversations (title, created_ts, updated_ts, model, project_id) VALUES (?, ?, ?, ?, ?)'
    )
    .run(title, now, now, opts.model ?? null, opts.projectId ?? null)
  const id = Number(result.lastInsertRowid)
  return getConversation(id)!
}

export function listConversations(): ChatConversation[] {
  return db()
    .prepare('SELECT * FROM conversations ORDER BY updated_ts DESC, id DESC LIMIT 200')
    .all()
    .map((row) => rowToConversation(row as ConversationRow))
}

export function getConversation(id: number): ChatConversation | null {
  const row = db().prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
    | ConversationRow
    | undefined
  return row ? rowToConversation(row) : null
}

export function listMessages(conversationId: number): ChatMessage[] {
  return db()
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC')
    .all(conversationId)
    .map((row) => rowToMessage(row as MessageRow))
}

export function addMessage(opts: {
  conversationId: number
  role: ChatRole
  content: string
  toolEvents?: ChatToolEvent[]
}): ChatMessage {
  const now = Date.now()
  const payload = opts.toolEvents && opts.toolEvents.length > 0 ? JSON.stringify(opts.toolEvents) : null
  const result = db()
    .prepare(
      'INSERT INTO messages (conversation_id, role, content, tool_payload, created_ts) VALUES (?, ?, ?, ?, ?)'
    )
    .run(opts.conversationId, opts.role, opts.content, payload, now)
  db().prepare('UPDATE conversations SET updated_ts = ? WHERE id = ?').run(now, opts.conversationId)
  const id = Number(result.lastInsertRowid)
  return rowToMessage({
    id,
    conversation_id: opts.conversationId,
    role: opts.role,
    content: opts.content,
    tool_payload: payload,
    created_ts: now
  })
}

export function updateMessageContent(messageId: number, content: string): void {
  db().prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, messageId)
}

export function appendToolEvent(messageId: number, event: ChatToolEvent): ChatToolEvent[] {
  const row = db()
    .prepare('SELECT tool_payload FROM messages WHERE id = ?')
    .get(messageId) as { tool_payload: string | null } | undefined
  let events: ChatToolEvent[] = []
  if (row?.tool_payload) {
    try {
      const parsed = JSON.parse(row.tool_payload)
      if (Array.isArray(parsed)) events = parsed as ChatToolEvent[]
    } catch {
      events = []
    }
  }
  events.push(event)
  db()
    .prepare('UPDATE messages SET tool_payload = ? WHERE id = ?')
    .run(JSON.stringify(events), messageId)
  return events
}

export function deleteConversation(id: number): void {
  db().prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

export function renameConversation(id: number, title: string): ChatConversation | null {
  const trimmed = title.trim()
  if (!trimmed) return getConversation(id)
  db()
    .prepare('UPDATE conversations SET title = ?, updated_ts = ? WHERE id = ?')
    .run(trimmed, Date.now(), id)
  return getConversation(id)
}
