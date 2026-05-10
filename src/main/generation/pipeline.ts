import type { GenerationSource, SprintReviewProgressEvent, SprintReviewSlideType } from '@shared/types'
import { resolveLlmProvider } from '../llm'
import { buildEnrichedContext } from './enricher'
import { generateSprintSummary } from './summarizer'
import { generateAllSlides } from './slide-generator'
import { assembleSlides } from './assembler'
import { aggregateUsage } from './utils'

export type PipelineResult = {
  markdown: string
  model: string
  finishReason: string | null
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null
  slideWarnings: { slide: SprintReviewSlideType; warning: string }[]
}

export async function runSprintReviewPipeline(
  opts: {
    source: GenerationSource
    projectName: string
    language: 'fr' | 'en'
  },
  emitProgress: (e: SprintReviewProgressEvent) => void
): Promise<PipelineResult> {
  const provider = resolveLlmProvider()

  const ctx = await buildEnrichedContext(
    opts.source,
    opts.projectName,
    opts.language,
    emitProgress
  )

  emitProgress({ type: 'summarizing' })
  const summary = await generateSprintSummary(provider, ctx)

  const slides = await generateAllSlides(provider, ctx, summary.text, emitProgress)

  emitProgress({ type: 'assembling' })
  const { markdown, warnings } = assembleSlides(slides.results, ctx)

  emitProgress({ type: 'done' })

  const allUsages = [summary.usage, ...slides.usages]
  const aggregated = aggregateUsage(allUsages)

  return {
    markdown,
    model: slides.model || summary.model,
    finishReason: null,
    usage: aggregated,
    slideWarnings: warnings
  }
}
