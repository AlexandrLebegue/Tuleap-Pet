import { ipcMain } from 'electron'
import { execa } from 'execa'
import { buildTuleapClient, mapArtifactSummary } from '../tuleap'
import { audit } from '../store/db'

export type TraceabilityEntry = {
  commit: string
  author: string
  date: string
  message: string
  artifactIds: number[]
}

export type TraceabilityResult =
  | {
      ok: true
      entries: TraceabilityEntry[]
      resolvedArtifacts: Array<{ id: number; title: string; status: string | null }>
    }
  | { ok: false; error: string }

const DEFAULT_REF_REGEX = '#(\\d{2,7})|art-(\\d{2,7})|\\[TLP-(\\d{2,7})\\]'

export function registerTraceabilityHandlers(): void {
  ipcMain.handle(
    'trace:file-history',
    async (
      _evt,
      args: { repoPath: string; filePath: string; refRegex?: string; limit?: number }
    ): Promise<TraceabilityResult> => {
      try {
        const limit = args.limit ?? 30
        const { stdout } = await execa(
          'git',
          ['log', `-n`, String(limit), '--pretty=format:%H%an%ai%s%n%b', '--', args.filePath],
          { cwd: args.repoPath, maxBuffer: 4_000_000 }
        )
        const regex = new RegExp(args.refRegex ?? DEFAULT_REF_REGEX, 'g')
        const entries: TraceabilityEntry[] = []
        const allIds = new Set<number>()
        for (const block of stdout.split(/^(?=[a-f0-9]{40})/m)) {
          const trimmed = block.trim()
          if (!trimmed) continue
          const [head, ...bodyLines] = trimmed.split('\n')
          const parts = head?.split('') ?? []
          const commit = parts[0] ?? ''
          const author = parts[1] ?? ''
          const date = parts[2] ?? ''
          const subject = parts[3] ?? ''
          const body = bodyLines.join('\n')
          const ids = new Set<number>()
          for (const m of `${subject}\n${body}`.matchAll(regex)) {
            const val = m[1] ?? m[2] ?? m[3]
            if (val) {
              const n = Number.parseInt(val, 10)
              if (Number.isFinite(n)) {
                ids.add(n)
                allIds.add(n)
              }
            }
          }
          entries.push({
            commit: commit.slice(0, 12),
            author,
            date,
            message: subject,
            artifactIds: Array.from(ids)
          })
        }

        const client = await buildTuleapClient()
        const resolvedArtifacts: Array<{ id: number; title: string; status: string | null }> = []
        for (const id of allIds) {
          try {
            const raw = await client.getArtifact(id)
            const a = mapArtifactSummary({
              id: raw.id,
              title: raw.title ?? '',
              status: raw.status ?? null,
              uri: raw.uri,
              html_url: raw.html_url ?? null,
              submitted_by_user: raw.submitted_by_user,
              submitted_by: raw.submitted_by,
              submitted_on: raw.submitted_on,
              last_modified_date: raw.last_modified_date,
              tracker: raw.tracker
            } as never)
            resolvedArtifacts.push({ id: a.id, title: a.title, status: a.status })
          } catch {
            /* skip */
          }
        }

        audit('trace.file-history', args.filePath, { commits: entries.length, ids: allIds.size })
        return { ok: true, entries, resolvedArtifacts }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
}
