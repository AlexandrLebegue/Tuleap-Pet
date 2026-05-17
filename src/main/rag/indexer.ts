import { getDatabase } from '../store/db'
import { buildTuleapClient, mapArtifactDetail } from '../tuleap'

/**
 * Lightweight embedding-free RAG: stores artifact titles+descriptions+comments
 * in SQLite with full-text search (FTS5). Avoids vector deps for now — when
 * we add embeddings the schema can be extended with a BLOB column.
 */

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS rag_artifacts (
  artifact_id INTEGER PRIMARY KEY,
  tracker_id  INTEGER,
  title       TEXT NOT NULL,
  status      TEXT,
  body        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS rag_fts USING fts5(
  title, body, content='rag_artifacts', content_rowid='artifact_id',
  tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS rag_artifacts_ai AFTER INSERT ON rag_artifacts BEGIN
  INSERT INTO rag_fts(rowid, title, body) VALUES (new.artifact_id, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS rag_artifacts_ad AFTER DELETE ON rag_artifacts BEGIN
  INSERT INTO rag_fts(rag_fts, rowid, title, body) VALUES('delete', old.artifact_id, old.title, old.body);
END;
CREATE TRIGGER IF NOT EXISTS rag_artifacts_au AFTER UPDATE ON rag_artifacts BEGIN
  INSERT INTO rag_fts(rag_fts, rowid, title, body) VALUES('delete', old.artifact_id, old.title, old.body);
  INSERT INTO rag_fts(rowid, title, body) VALUES (new.artifact_id, new.title, new.body);
END;
`

let migrated = false
function ensureSchema(): void {
  if (migrated) return
  const db = getDatabase()
  db.exec(MIGRATION_SQL)
  migrated = true
}

export type RagSearchHit = {
  id: number
  title: string
  status: string | null
  snippet: string
  trackerId: number | null
}

export function searchArtifacts(query: string, limit = 8): RagSearchHit[] {
  ensureSchema()
  const db = getDatabase()
  const ftsQuery = query.replace(/[^\w\s\-éèêàùç]/gi, ' ').trim()
  if (!ftsQuery) return []
  try {
    const rows = db
      .prepare(
        `SELECT a.artifact_id as id, a.title, a.status, a.tracker_id as trackerId,
                snippet(rag_fts, 1, '[', ']', '…', 24) as snippet
         FROM rag_fts JOIN rag_artifacts a ON a.artifact_id = rag_fts.rowid
         WHERE rag_fts MATCH ? ORDER BY bm25(rag_fts) LIMIT ?`
      )
      .all(ftsQuery, limit) as Array<{
      id: number
      title: string
      status: string | null
      trackerId: number | null
      snippet: string
    }>
    return rows
  } catch {
    return []
  }
}

export async function indexClosedArtifacts(
  projectId: number,
  opts: { onProgress?: (done: number, total: number) => void; limit?: number } = {}
): Promise<{ indexed: number; skipped: number }> {
  ensureSchema()
  const db = getDatabase()
  const client = await buildTuleapClient()
  const trackers = await client.listTrackers(projectId, { limit: 50 })
  const upsert = db.prepare(
    `INSERT INTO rag_artifacts (artifact_id, tracker_id, title, status, body, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(artifact_id) DO UPDATE SET
       tracker_id=excluded.tracker_id, title=excluded.title,
       status=excluded.status, body=excluded.body, updated_at=excluded.updated_at`
  )
  let indexed = 0
  let skipped = 0
  const cap = opts.limit ?? 500
  let total = 0
  for (const tracker of trackers.items) {
    if (indexed >= cap) break
    try {
      const page = await client.listArtifacts(tracker.id, { limit: 100, offset: 0 })
      for (const raw of page.items) {
        if (indexed >= cap) break
        const summary = mapArtifactDetail(
          raw as unknown as Parameters<typeof mapArtifactDetail>[0]
        )
        const status = (summary.status ?? '').toLowerCase()
        if (!status.includes('done') && !status.includes('closed') && !status.includes('fermé')) {
          skipped += 1
          continue
        }
        const body = [summary.description ?? '', ...summary.values.map((v) => v.label ?? '')]
          .filter(Boolean)
          .join('\n')
          .slice(0, 8000)
        upsert.run(
          summary.id,
          summary.trackerId ?? null,
          summary.title || `#${summary.id}`,
          summary.status ?? null,
          body,
          Date.now()
        )
        indexed += 1
        total += 1
        if (opts.onProgress && total % 20 === 0) opts.onProgress(indexed, cap)
      }
    } catch {
      skipped += 1
    }
  }
  if (opts.onProgress) opts.onProgress(indexed, indexed)
  return { indexed, skipped }
}
