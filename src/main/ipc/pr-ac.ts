import { ipcMain } from 'electron'
import { execa } from 'execa'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { buildTuleapClient, mapArtifactDetail } from '../tuleap'
import { resolveLlmProvider } from '../llm'
import { audit } from '../store/db'
import { applyWrite } from '../llm/write-tools'
import { getConfig } from '../store/config'
import { cloneRepo, execGit } from '../commenter/git-utils'
import { injectGitCredentials } from '../jobs/git-credentials'
import type { ArtifactDetail, GitRepository } from '@shared/types'

export type AcCheckItem = {
  ac: string
  coverage: 'covered' | 'partial' | 'missing' | 'unverifiable'
  evidence: string
}

export type PullRequestSummary = {
  id: number
  title: string
  branchSrc: string
  branchDest: string
  status: string
  htmlUrl: string
}

export type PrAcCheckResult =
  | {
      ok: true
      artifact: ArtifactDetail
      items: AcCheckItem[]
      summaryMarkdown: string
      testsFound: boolean
      docScore: number
    }
  | { ok: false; error: string }

function extractAcceptanceCriteria(detail: ArtifactDetail): string[] {
  const sources: string[] = []
  if (detail.description) sources.push(detail.description)
  for (const v of detail.values) {
    const label = (v.label || '').toLowerCase()
    if (label.includes('accept') || label.includes('critere') || label.includes('critère')) {
      const raw = (v as unknown as { value?: { value?: string } }).value
      const text = raw && typeof raw === 'object' && 'value' in raw ? String(raw.value ?? '') : ''
      if (text) sources.push(text)
    }
  }
  const joined = sources.join('\n')
  const lines = joined.split(/\r?\n/)
  const ac: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    if (/^[-*•]\s+/.test(t) || /^\d+[.)]\s+/.test(t) || /^\[\s?[ x]\s?\]/i.test(t)) {
      ac.push(t.replace(/^[-*•\d.)\s]+|^\[\s?[ x]\s?\]\s*/i, '').trim())
    }
  }
  if (ac.length === 0 && detail.description) {
    return detail.description
      .split(/\.\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 12)
      .slice(0, 8)
  }
  return ac
}

function inferArtifactIdFromBranch(branch: string): number | null {
  const m = branch.match(/(?:^|[-/_])(\d{2,7})(?:[-_]|$)/)
  return m ? Number.parseInt(m[1]!, 10) : null
}

function detectTests(diff: string): boolean {
  return /\+\+\+ b\/.*(?:test|spec|__tests__|_test\.|\.test\.|\.spec\.)/i.test(diff)
}

function computeDocScore(diff: string): number {
  const addedLines = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'))
  if (addedLines.length === 0) return 0
  const commentLines = addedLines.filter((l) =>
    /^\+\s*(\/\/|\/\*|\*|#|<!--)/.test(l)
  )
  return Math.round((commentLines.length / addedLines.length) * 100)
}

async function ensureRepoCloned(repoId: number, cloneUrl: string): Promise<string> {
  const tempClonePath = getConfig().tempClonePath
  if (!tempClonePath) throw new Error('Chemin de clonage non configuré dans les Paramètres.')
  const targetDir = join(tempClonePath, `pr-ac-${repoId}`)
  const authenticatedUrl = await injectGitCredentials(cloneUrl)
  // Check if already cloned — if so, just fetch
  try {
    await execGit(['rev-parse', '--git-dir'], targetDir)
    await execa('git', ['-C', targetDir, 'fetch', '--all', '--quiet'], { reject: false })
    return targetDir
  } catch { /* not cloned yet */ }
  await mkdir(targetDir, { recursive: true }).catch(() => {})
  await cloneRepo(authenticatedUrl, targetDir)
  return targetDir
}

export function registerPrAcHandlers(): void {
  ipcMain.handle(
    'pr-ac:list-repos',
    async (): Promise<GitRepository[]> => {
      try {
        const projectId = getConfig().projectId
        if (!projectId) return []
        const client = await buildTuleapClient()
        const page = await client.listGitRepositories(projectId, { limit: 50 })
        return page.items.map((raw) => ({
          id: raw.id,
          name: raw.name ?? '',
          description: raw.description ?? '',
          cloneUrl: raw.clone_http_url ?? raw.http_url ?? ''
        }))
      } catch {
        return []
      }
    }
  )

  ipcMain.handle(
    'pr-ac:list-prs',
    async (_evt, args: { repoId: number }): Promise<PullRequestSummary[]> => {
      try {
        const client = await buildTuleapClient()
        const page = await client.listPullRequests(args.repoId, { limit: 50 })
        return page.items.map((raw) => ({
          id: raw.id,
          title: raw.title,
          branchSrc: raw.branch_src,
          branchDest: raw.branch_dest,
          status: raw.status,
          htmlUrl: raw.html_url
        }))
      } catch {
        return []
      }
    }
  )

  ipcMain.handle(
    'pr-ac:analyze',
    async (
      _evt,
      args: { prId: number; repoId: number; cloneUrl: string; artifactIdHint?: number | null; branchSrc: string; branchDest: string }
    ): Promise<PrAcCheckResult> => {
      try {
        // 1. Resolve artifact
        let artifactId = args.artifactIdHint ?? inferArtifactIdFromBranch(args.branchSrc)
        if (!artifactId) {
          return { ok: false, error: "Impossible de deviner l'artéfact lié. Précisez l'ID dans le titre de la PR (ex: #1234)." }
        }
        const client = await buildTuleapClient()
        const raw = await client.getArtifact(artifactId)
        const detail = mapArtifactDetail(raw)
        const acItems = extractAcceptanceCriteria(detail)
        if (acItems.length === 0) {
          return { ok: false, error: "Aucun critère d'acceptation trouvé dans cet artéfact." }
        }

        // 2. Clone / fetch repo
        const repoPath = await ensureRepoCloned(args.repoId, args.cloneUrl)

        // 3. Git diff
        const { stdout: diff } = await execa(
          'git',
          ['-C', repoPath, 'diff', `origin/${args.branchDest}...origin/${args.branchSrc}`, '--', ':!*.lock', ':!*.min.js'],
          { maxBuffer: 4 * 1024 * 1024, reject: false }
        )
        const trimmedDiff = diff.length > 30000 ? diff.slice(0, 30000) + '\n…[truncated]' : diff

        // 4. Checks
        const testsFound = detectTests(trimmedDiff)
        const docScore = computeDocScore(trimmedDiff)

        // 5. LLM analysis
        const provider = resolveLlmProvider()
        const prompt = `Tu es un reviewer technique. Voici un diff git et une liste de critères d'acceptation (AC) du ticket lié.\n\nPour CHAQUE AC, dis si le diff le couvre :\n- covered : implémenté/testé clairement\n- partial : partiel ou conditionnel\n- missing : pas implémenté\n- unverifiable : impossible à vérifier sans contexte runtime\n\nRéponds STRICTEMENT en JSON :\n[{"ac":"...","coverage":"covered|partial|missing|unverifiable","evidence":"<1-2 phrases citant fichiers/fonctions du diff>"}, ...]\n\n# Critères d'acceptation\n${acItems.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\n# Diff\n\n\`\`\`diff\n${trimmedDiff}\n\`\`\``
        const llm = await provider.generate({
          messages: [
            { role: 'system', content: 'Tu réponds toujours en JSON valide, sans markdown autour.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2,
          maxOutputTokens: 2000
        })
        const text = llm.text.trim().replace(/^```(?:json)?\s*|```$/g, '')
        let items: AcCheckItem[]
        try {
          items = JSON.parse(text)
        } catch {
          items = acItems.map((ac) => ({ ac, coverage: 'unverifiable' as const, evidence: 'Parsing LLM échoué' }))
        }

        // 6. Build markdown summary
        const coveredCount = items.filter((i) => i.coverage === 'covered').length
        const testLine = testsFound ? '✅ Des tests ont été ajoutés/modifiés.' : '⚠️ Aucun test détecté dans le diff.'
        const docLine = `📝 Score documentation : ${docScore}% des lignes ajoutées sont commentées.`
        const summary = [
          `## Revue PR #${args.prId} — Ticket Tuleap #${detail.id} — ${detail.title}`,
          '',
          `**AC couvertes :** ${coveredCount}/${items.length}`,
          testLine,
          docLine,
          '',
          '### Détail des critères',
          '',
          ...items.map((it) => `- **${it.coverage}** — ${it.ac}\n  > ${it.evidence}`)
        ].join('\n')

        // 7. Post comment on PR
        try {
          await client.postPrComment(args.prId, summary)
        } catch { /* non-fatal — still return result */ }

        audit('pr-ac.analyze', String(artifactId), { items: items.length, testsFound, docScore })
        return { ok: true, artifact: detail, items, summaryMarkdown: summary, testsFound, docScore }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { ok: false, error: message }
      }
    }
  )

  // Keep for manual / legacy use
  ipcMain.handle(
    'pr-ac:post-comment',
    async (_evt, args: { artifactId: number; markdown: string }): Promise<{ ok: boolean; error?: string }> => {
      try {
        await applyWrite({
          kind: 'add_comment',
          artifactId: args.artifactId,
          comment: args.markdown
        })
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
}
