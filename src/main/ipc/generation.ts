import { ipcMain } from 'electron'
import {
  TuleapError,
  buildTuleapClient,
  mapArtifactSummary,
  mapMilestone,
  mapMilestoneContentItem
} from '../tuleap'
import { getConfig, getLlmModel, getLlmProvider } from '../store/config'
import { resolveLlmProvider, toLlmError } from '../llm'
import { audit } from '../store/db'
import type {
  ConnectionTestResult,
  GenerationSource,
  MilestoneStatus,
  MilestoneSummary,
  SprintContent,
  SprintReviewProgressEvent,
  SprintReviewSlideType
} from '@shared/types'
import { runSprintReviewPipeline } from '../generation/pipeline'

async function fetchSprintContent(milestoneId: number): Promise<SprintContent> {
  const client = await buildTuleapClient()
  const milestoneRaw = await client.getMilestone(milestoneId)
  const contentItems = await client.fetchAll((offset) =>
    client.listMilestoneContent(milestoneId, { limit: 50, offset })
  )
  return {
    milestone: mapMilestone(milestoneRaw),
    artifacts: contentItems.map(mapMilestoneContentItem)
  }
}

export type GenerationResult = {
  markdown: string
  model: string
  finishReason: string | null
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null
  slideWarnings?: { slide: SprintReviewSlideType; warning: string }[]
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
      const items = await client.fetchAll((offset) =>
        client.listMilestones(projectId, { status: validStatus, limit: 50, offset })
      )
      return items.map(mapMilestone)
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

  ipcMain.handle(
    'generation:list-tracker-artifacts',
    async (_event, trackerId: unknown) => {
      if (typeof trackerId !== 'number' || !Number.isInteger(trackerId) || trackerId <= 0) {
        throw new TuleapError('unknown', 'trackerId invalide.')
      }
      audit('generation.list-tracker-artifacts', String(trackerId))
      const client = await buildTuleapClient()
      const items = await client.fetchAll((offset) =>
        client.listArtifacts(trackerId, { limit: 50, offset })
      )
      return items.map(mapArtifactSummary)
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
      event,
      args: unknown
    ): Promise<GenerationResult> => {
      if (!args || typeof args !== 'object') {
        throw new Error('Arguments invalides.')
      }
      const { source, language } = args as {
        source?: GenerationSource
        language?: 'fr' | 'en'
      }

      if (!source || typeof source !== 'object' || !('mode' in source)) {
        throw new Error('source invalide : mode requis.')
      }
      if (source.mode === 'sprint') {
        if (typeof source.milestoneId !== 'number' || !Number.isInteger(source.milestoneId) || source.milestoneId <= 0) {
          throw new Error('milestoneId invalide.')
        }
      } else if (source.mode === 'custom') {
        if (!Array.isArray(source.artifactIds) || source.artifactIds.length === 0) {
          throw new Error('artifactIds invalide : tableau non vide requis.')
        }
        if (typeof source.label !== 'string' || !source.label.trim()) {
          throw new Error('label invalide.')
        }
      } else {
        throw new Error('source.mode invalide.')
      }

      const resolvedLanguage: 'fr' | 'en' =
        language === 'fr' || language === 'en' ? language : 'fr'

      const projectId = getConfig().projectId
      if (typeof projectId !== 'number') {
        throw new TuleapError('unknown', "Aucun projet n'est sélectionné.")
      }

      const sourceLabel = source.mode === 'sprint' ? String(source.milestoneId) : source.label
      audit('generation.sprint-review.start', sourceLabel, { mode: source.mode, language: resolvedLanguage })

      const client = await buildTuleapClient()
      const project = await client.getProject(projectId)

      const emitProgress = (e: SprintReviewProgressEvent): void => {
        event.sender.send('generation:progress', e)
      }

      const pipelineResult = await runSprintReviewPipeline(
        { source, projectName: project.label, language: resolvedLanguage },
        emitProgress
      )

      audit('generation.sprint-review.done', sourceLabel, {
        model: pipelineResult.model,
        usage: pipelineResult.usage,
        warnings: pipelineResult.slideWarnings.length
      })

      return {
        markdown: pipelineResult.markdown,
        model: pipelineResult.model,
        finishReason: pipelineResult.finishReason,
        usage: pipelineResult.usage,
        slideWarnings: pipelineResult.slideWarnings
      }
    }
  )
}

export type GenerationConnectionTestResult = ConnectionTestResult
