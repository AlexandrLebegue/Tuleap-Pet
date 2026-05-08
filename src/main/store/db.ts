import { app } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'

let db: Database.Database | null = null

const MIGRATIONS: Array<{ id: number; up: string }> = [
  {
    id: 1,
    up: `
      CREATE TABLE IF NOT EXISTS audit_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        ts          INTEGER NOT NULL,
        action      TEXT NOT NULL,
        target      TEXT,
        payload     TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log(ts);
      CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
    `
  },
  {
    id: 2,
    up: `
      CREATE TABLE IF NOT EXISTS conversations (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        title        TEXT NOT NULL,
        created_ts   INTEGER NOT NULL,
        updated_ts   INTEGER NOT NULL,
        model        TEXT,
        project_id   INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_ts DESC);

      CREATE TABLE IF NOT EXISTS messages (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role            TEXT NOT NULL,
        content         TEXT NOT NULL,
        tool_payload    TEXT,
        created_ts      INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);
    `
  }
]

function dbPath(): string {
  const dir = join(app.getPath('userData'), 'data')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'tuleap-companion.db')
}

function applyMigrations(connection: Database.Database): void {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id      INTEGER PRIMARY KEY,
      applied INTEGER NOT NULL
    );
  `)
  const applied = new Set(
    connection
      .prepare('SELECT id FROM schema_migrations')
      .all()
      .map((row) => (row as { id: number }).id)
  )
  const insert = connection.prepare('INSERT INTO schema_migrations (id, applied) VALUES (?, ?)')
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue
    connection.exec(migration.up)
    insert.run(migration.id, Date.now())
  }
}

export function initDatabase(): Database.Database {
  if (db) return db
  const connection = new Database(dbPath())
  connection.pragma('journal_mode = WAL')
  connection.pragma('foreign_keys = ON')
  applyMigrations(connection)
  db = connection
  return connection
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database has not been initialised. Call initDatabase() first.')
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function audit(
  action: string,
  target?: string | null,
  payload?: unknown
): void {
  if (!db) return
  db.prepare('INSERT INTO audit_log (ts, action, target, payload) VALUES (?, ?, ?, ?)').run(
    Date.now(),
    action,
    target ?? null,
    payload === undefined ? null : JSON.stringify(payload)
  )
}
