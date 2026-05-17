import { ipcMain } from 'electron'
import {
  buildTuleapClient,
  mapArtifactSummary,
  mapMilestone,
  mapMilestoneContentItem
} from '../tuleap'
import { resolveLlmProvider } from '../llm'
import { audit } from '../store/db'
import { getConfig } from '../store/config'

export type PlanningProposal = {
  ok: true
  velocityAvg: number
  velocityHistory: Array<{ milestoneId: number; label: string; itemsClosed: number }>
  proposedItems: Array<{ id: number; title: string; reason: string; risk: 'low' | 'medium' | 'high' }>
  rationaleMarkdown: string
}

export function registerSprintPlanningHandlers(): void {
  ipcMain.handle(
    'planning:propose',
    async (
      _evt,
      args: { milestoneId: number; absencesNote?: string; capacityFactor?: number }
    ): Promise<PlanningProposal | { ok: false; error: string }> => {
      try {
        const projectId = getConfig().projectId
        if (!projectId) return { ok: false, error: 'Aucun projet sélectionné.' }
        const client = await buildTuleapClient()

        const closed = await client.listMilestones(projectId, { status: 'closed', limit: 6 })
        const velocityHistory: Array<{ milestoneId: number; label: string; itemsClosed: number }> = []
        for (const milestoneRaw of closed.items) {
          const m = mapMilestone(milestoneRaw)
          try {
            const content = await client.listMilestoneContent(m.id, { limit: 200 })
            const items = content.items.map(mapMilestoneContentItem)
            const closedCount = items.filter((it) => {
              const s = (it.status ?? '').toLowerCase()
              return s.includes('done') || s.includes('closed') || s.includes('fermé')
            }).length
            velocityHistory.push({ milestoneId: m.id, label: m.label, itemsClosed: closedCount })
          } catch {
            /* skip */
          }
        }
        const velocityAvg =
          velocityHistory.length > 0
            ? Math.round(
                velocityHistory.reduce((sum, h) => sum + h.itemsClosed, 0) / velocityHistory.length
              )
            : 0

        const capacity = Math.max(1, Math.round(velocityAvg * (args.capacityFactor ?? 1)))

        const trackers = await client.listTrackers(projectId, { limit: 10 })
        const candidates: Array<{ id: number; title: string; status: string | null }> = []
        for (const t of trackers.items.slice(0, 5)) {
          try {
            const page = await client.listArtifacts(t.id, { limit: 50, offset: 0 })
            for (const raw of page.items) {
              const it = mapArtifactSummary(raw)
              const s = (it.status ?? '').toLowerCase()
              if (s.includes('done') || s.includes('closed') || s.includes('fermé')) continue
              candidates.push({ id: it.id, title: it.title, status: it.status })
            }
          } catch {
            /* skip */
          }
          if (candidates.length >= 80) break
        }

        const provider = resolveLlmProvider()
        const prompt = `Tu es un Product Owner expérimenté. Propose une composition de sprint à partir du backlog candidat et de la vélocité historique.

# Vélocité
Moyenne sur ${velocityHistory.length} sprints : ${velocityAvg} items clos / sprint.
Détails : ${velocityHistory.map((h) => `${h.label}=${h.itemsClosed}`).join(', ')}

# Capacité cible
Environ ${capacity} items à embarquer ce sprint.

# Absences déclarées
${args.absencesNote || 'aucune'}

# Backlog candidat (${candidates.length} items)
${candidates.slice(0, 60).map((c) => `- #${c.id} [${c.status ?? '?'}] ${c.title.slice(0, 100)}`).join('\n')}

Réponds STRICTEMENT en JSON :
{
  "selection": [{"id": <number>, "reason": "<1 phrase>", "risk": "low|medium|high"}, ...],
  "rationale": "<1 paragraphe markdown sur les choix>"
}`
        const llm = await provider.generate({
          messages: [
            { role: 'system', content: 'Tu réponds toujours en JSON valide, sans markdown autour.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.4,
          maxOutputTokens: 2000
        })
        const text = llm.text.trim().replace(/^```(?:json)?\s*|```$/g, '')
        let parsed: { selection: Array<{ id: number; reason: string; risk: 'low' | 'medium' | 'high' }>; rationale: string }
        try {
          parsed = JSON.parse(text)
        } catch {
          parsed = { selection: [], rationale: 'Parsing LLM échoué — réessayez.' }
        }
        const titleById = new Map(candidates.map((c) => [c.id, c.title]))
        audit('planning.propose', String(args.milestoneId), {
          velocityAvg,
          selected: parsed.selection.length
        })
        return {
          ok: true,
          velocityAvg,
          velocityHistory,
          proposedItems: parsed.selection.map((s) => ({
            id: s.id,
            title: titleById.get(s.id) ?? `#${s.id}`,
            reason: s.reason,
            risk: s.risk
          })),
          rationaleMarkdown: parsed.rationale
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
}
