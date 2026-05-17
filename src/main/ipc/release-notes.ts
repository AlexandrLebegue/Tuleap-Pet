import { ipcMain } from 'electron'
import { execa } from 'execa'
import { buildTuleapClient, mapArtifactSummary } from '../tuleap'
import { resolveLlmProvider } from '../llm'
import { audit } from '../store/db'
import { getConfig } from '../store/config'

export type ReleaseNotesRequest = {
  repoPath: string
  fromRef: string
  toRef: string
  windowDays?: number
  artifactRefRegex?: string
}

export type ReleaseNotesResult =
  | {
      ok: true
      markdown: string
      commitCount: number
      artifactIdsResolved: number[]
    }
  | { ok: false; error: string }

const DEFAULT_REF_REGEX = '#(\\d{2,7})'

export function registerReleaseNotesHandlers(): void {
  ipcMain.handle(
    'release-notes:generate',
    async (_evt, args: ReleaseNotesRequest): Promise<ReleaseNotesResult> => {
      try {
        const { stdout: log } = await execa(
          'git',
          ['log', `${args.fromRef}..${args.toRef}`, '--pretty=format:%h%an%s%b'],
          { cwd: args.repoPath, maxBuffer: 4 * 1024 * 1024 }
        )
        const commits = log
          .split('')
          .map((c) => c.trim())
          .filter(Boolean)
          .map((c) => {
            const [hash, author, subject, body] = c.split('')
            return { hash: hash ?? '', author: author ?? '', subject: subject ?? '', body: body ?? '' }
          })

        const refRegex = new RegExp(args.artifactRefRegex ?? DEFAULT_REF_REGEX, 'g')
        const artifactIds = new Set<number>()
        for (const c of commits) {
          for (const m of `${c.subject}\n${c.body}`.matchAll(refRegex)) {
            const id = Number.parseInt(m[1]!, 10)
            if (Number.isFinite(id)) artifactIds.add(id)
          }
        }

        const projectId = getConfig().projectId
        const resolved: Array<{ id: number; title: string; tracker: number | null }> = []
        if (projectId && artifactIds.size > 0) {
          const client = await buildTuleapClient()
          for (const id of artifactIds) {
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
              resolved.push({ id: a.id, title: a.title, tracker: a.trackerId ?? null })
            } catch {
              /* skip unreachable refs */
            }
          }
        }

        const commitsSample = commits.slice(0, 60)
        const provider = resolveLlmProvider()
        const prompt = `Tu génères des release notes Markdown à partir des commits git et des artéfacts Tuleap mentionnés.

# Commits (${commits.length})
${commitsSample
  .map((c) => `- \`${c.hash}\` ${c.subject}`)
  .join('\n')}${commits.length > commitsSample.length ? `\n…et ${commits.length - commitsSample.length} de plus` : ''}

# Artéfacts résolus (${resolved.length})
${resolved.map((a) => `- #${a.id} — ${a.title}`).join('\n')}

Réponds en Markdown avec sections : ## ✨ Features / ## 🐛 Fixes / ## 🛠 Chore / ## ⚠️ Breaking.
Cite chaque entrée comme : - "Texte" (#id) si artéfact connu, sinon (commit \`abc1234\`).
Si une section est vide, omets-la. Réponse en français, ton professionnel.`
        const llm = await provider.generate({
          messages: [
            { role: 'system', content: 'Tu écris des release notes Markdown concises et bien structurées.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          maxOutputTokens: 2000
        })
        audit('release-notes.generate', null, {
          commits: commits.length,
          artifacts: resolved.length
        })
        return {
          ok: true,
          markdown: llm.text.trim(),
          commitCount: commits.length,
          artifactIdsResolved: resolved.map((a) => a.id)
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle('release-notes:list-tags', async (_evt, repoPath: string) => {
    try {
      const { stdout } = await execa('git', ['tag', '--sort=-creatordate'], { cwd: repoPath })
      return stdout.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 50)
    } catch {
      return []
    }
  })
}
