import { ipcMain } from 'electron'
import { execa } from 'execa'
import { buildTuleapClient, mapArtifactDetail } from '../tuleap'
import { resolveLlmProvider } from '../llm'
import { audit } from '../store/db'
import { applyWrite } from '../llm/write-tools'
import type { ArtifactDetail } from '@shared/types'

export type AcCheckItem = {
  ac: string
  coverage: 'covered' | 'partial' | 'missing' | 'unverifiable'
  evidence: string
}

export type PrAcCheckResult =
  | {
      ok: true
      artifact: ArtifactDetail
      items: AcCheckItem[]
      summaryMarkdown: string
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

export function registerPrAcHandlers(): void {
  ipcMain.handle(
    'pr-ac:analyze',
    async (
      _evt,
      args: { repoPath: string; baseBranch: string; headBranch: string; artifactIdHint?: number | null }
    ): Promise<PrAcCheckResult> => {
      try {
        let artifactId = args.artifactIdHint ?? inferArtifactIdFromBranch(args.headBranch)
        if (!artifactId) {
          return { ok: false, error: "Impossible de deviner l'artéfact lié. Précisez l'ID." }
        }
        const client = await buildTuleapClient()
        const raw = await client.getArtifact(artifactId)
        const detail = mapArtifactDetail(raw)
        const acItems = extractAcceptanceCriteria(detail)
        if (acItems.length === 0) {
          return { ok: false, error: 'Aucun critère d\'acceptation trouvé dans cet artéfact.' }
        }

        const { stdout: diff } = await execa(
          'git',
          ['diff', `${args.baseBranch}...${args.headBranch}`, '--', ':!*.lock', ':!*.min.js'],
          { cwd: args.repoPath, maxBuffer: 4 * 1024 * 1024 }
        )
        const trimmedDiff = diff.length > 30000 ? diff.slice(0, 30000) + '\n…[truncated]' : diff

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
        const summary = [
          `## Vérification AC pour #${detail.id} — ${detail.title}`,
          '',
          ...items.map((it) => `- **${it.coverage}** — ${it.ac}\n  > ${it.evidence}`)
        ].join('\n')
        audit('pr-ac.analyze', String(artifactId), { items: items.length })
        return { ok: true, artifact: detail, items, summaryMarkdown: summary }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { ok: false, error: message }
      }
    }
  )

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
