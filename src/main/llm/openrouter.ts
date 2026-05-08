import { generateText, streamText, type ModelMessage } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { toLlmError } from './errors'
import type {
  LlmGenerateRequest,
  LlmGenerateResult,
  LlmMessage,
  LlmProvider,
  LlmStreamChunk,
  LlmUsage
} from './types'

export type OpenRouterProviderOptions = {
  apiKey: string
  defaultModel: string
  appName?: string
  appUrl?: string
}

function toModelMessages(messages: LlmMessage[]): ModelMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }))
}

function toUsage(usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined): LlmUsage | null {
  if (!usage) return null
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens
  }
}

export function createOpenRouterProvider(opts: OpenRouterProviderOptions): LlmProvider {
  if (!opts.apiKey) {
    throw new Error('createOpenRouterProvider: apiKey est requis.')
  }
  const openrouter = createOpenRouter({
    apiKey: opts.apiKey,
    headers: {
      // Identify the client to OpenRouter (optional but recommended).
      'HTTP-Referer': opts.appUrl ?? 'https://github.com/AlexandrLebegue/Tuleap-Pet',
      'X-Title': opts.appName ?? 'Tuleap AI Companion'
    }
  })

  const resolveModel = (override?: string): string => {
    const id = override?.trim() || opts.defaultModel
    if (!id) throw new Error('Aucun modèle OpenRouter configuré.')
    return id
  }

  return {
    name: 'openrouter',

    async generate(request: LlmGenerateRequest): Promise<LlmGenerateResult> {
      const modelId = resolveModel(request.model)
      try {
        const result = await generateText({
          model: openrouter(modelId),
          messages: toModelMessages(request.messages),
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens
        })
        return {
          text: result.text,
          model: modelId,
          finishReason: result.finishReason ?? null,
          usage: toUsage(result.usage)
        }
      } catch (err) {
        throw toLlmError(err, modelId)
      }
    },

    async stream(
      request: LlmGenerateRequest,
      onChunk: (chunk: LlmStreamChunk) => void
    ): Promise<LlmGenerateResult> {
      const modelId = resolveModel(request.model)
      try {
        const result = streamText({
          model: openrouter(modelId),
          messages: toModelMessages(request.messages),
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens
        })

        let buffered = ''
        for await (const delta of result.textStream) {
          buffered += delta
          onChunk({ type: 'text', delta })
        }

        const finishReason = (await result.finishReason) ?? null
        const usage = toUsage(await result.usage)
        onChunk({ type: 'finish', finishReason, usage })

        return { text: buffered, model: modelId, finishReason, usage }
      } catch (err) {
        throw toLlmError(err, modelId)
      }
    }
  }
}
