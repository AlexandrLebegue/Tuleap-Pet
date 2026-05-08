import { ipcMain } from 'electron'
import {
  TuleapError,
  buildTuleapClient,
  mapArtifactSummary,
  mapMilestone
} from '../tuleap'
import { getConfig, getLlmModel, getLlmProvider } from '../store/config'
import { resolveLlmProvider, toLlmError } from '../llm'
import { audit } from '../store/db'
import { buildSprintReviewMessages } from '../prompts'
import type {
  ConnectionTestResult,
  MilestoneStatus,
  MilestoneSummary,
  SprintContent
} from '@shared/types'

async function fetchSprintContent(milestoneId: number): Promise<SprintContent> {
  const client = await buildTuleapClient()
  const milestoneRaw = await client.getMilestone(milestoneId)
  const contentPage = await client.listMilestoneContent(milestoneId, { limit: 200 })
  return {
    milestone: mapMilestone(milestoneRaw),
    artifacts: contentPage.items.map(mapArtifactSummary)
  }
}

export type GenerationResult = {
  markdown: string
  model: string
  finishReason: string | null
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null
}

export type LlmTestResult =
  | { ok: true; model: string; sample: string; provider: string }
  | { ok: false; error: string; kind: string; provider?: string; attemptedModel?: string; status?: number }

export function registerGenerationHandlers(): void {
  ipcMain.handle(
    'generation:list-sprints',
    async (_event, status?: unknown): Promise<MilestoneSummary[]> => {
      const projectId = getConfig().projectId
      if (typeof projectId !== 'number') {
        throw new TuleapError('unknown', "Aucun projet n'est sélectionné.")
      }
      const validStatus: MilestoneStatus =
        status === 'open' || status === 'closed' || status === 'all' ? status : 'open'
      audit('generation.list-sprints', `${projectId}:${validStatus}`)
      const client = await buildTuleapClient()
      const page = await client.listMilestones(projectId, { status: validStatus, limit: 100 })
      return page.items.map(mapMilestone)
    }
  )

  ipcMain.handle(
    'generation:get-sprint-content',
    async (_event, milestoneId: unknown): Promise<SprintContent> => {
      if (typeof milestoneId !== 'number' || !Number.isInteger(milestoneId) || milestoneId <= 0) {
        throw new TuleapError('unknown', 'milestoneId invalide.')
      }
      audit('generation.get-sprint-content', String(milestoneId))
      return fetchSprintContent(milestoneId)
    }
  )

ipcMain.handle('generation:test-llm', async (): Promise<LlmTestResult> => {
    const resolvedProvider = getLlmProvider()
    const resolvedModel = getLlmModel()
    audit('generation.test-llm', `${resolvedProvider}:${resolvedModel}`)
    try {
      const provider = resolveLlmProvider()
      const result = await provider.generate({
        messages: [
          { role: 'system', content: 'Réponds très brièvement.' },
          { role: 'user', content: 'Réponds par OK suivi du nom du modèle utilisé.' }
        ],
        maxOutputTokens: 64,
        temperature: 0
      })
      return {
        ok: true,
        model: result.model,
        sample: result.text.trim().slice(0, 200),
        provider: resolvedProvider
      }
    } catch (err) {
      const e = toLlmError(err)
      return {
        ok: false,
        error: e.message,
        kind: e.kind,
        provider: resolvedProvider,
        attemptedModel: resolvedModel,
        status: e.status
      }
    }
  })

  ipcMain.handle(
    'generation:generate-sprint-review',
    async (
      _event,
      args: unknown
    ): Promise<GenerationResult> => {
      if (!args || typeof args !== 'object') {
        throw new Error('Arguments invalides.')
      }
      const { milestoneId, language } = args as {
        milestoneId?: number
        language?: 'fr' | 'en'
      }
      if (typeof milestoneId !== 'number' || !Number.isInteger(milestoneId) || milestoneId <= 0) {
        throw new Error('milestoneId invalide.')
      }
      audit('generation.sprint-review.start', String(milestoneId), { language })

      const projectId = getConfig().projectId
      if (typeof projectId !== 'number') {
        throw new TuleapError('unknown', "Aucun projet n'est sélectionné.")
      }

      const client = await buildTuleapClient()
      const project = await client.getProject(projectId)
      const content = await fetchSprintContent(milestoneId)

      const messages = buildSprintReviewMessages({
        projectName: project.label,
        milestone: content.milestone,
        artifacts: content.artifacts,
        language: language ?? 'fr'
      })

      const provider = resolveLlmProvider()
      const result = await provider.generate({
        messages,
        temperature: 0.3,
        maxOutputTokens: 4096
      })

      audit('generation.sprint-review.done', String(milestoneId), {
        model: result.model,
        usage: result.usage
      })

      return {
        markdown: result.text,
        model: result.model,
        finishReason: result.finishReason,
        usage: result.usage
      }
    }
  )
}

export type GenerationConnectionTestResult = ConnectionTestResult
