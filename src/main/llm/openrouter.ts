import { generateText, stepCountIs, type ModelMessage } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { toLlmError } from './errors'
import { runAgentLoop } from './agent'
import type {
  LlmAgentCallbacks,
  LlmGenerateRequest,
  LlmGenerateResult,
  LlmMessage,
  LlmProvider,
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
          temperature: request.thinking ? undefined : request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          tools: request.tools,
          stopWhen: request.tools ? stepCountIs(request.maxSteps ?? 6) : undefined,
          providerOptions: request.thinking
            ? { openrouter: { reasoning: { effort: 'high' } } }
            : undefined
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

    async runTools(
      request: LlmGenerateRequest,
      cb?: LlmAgentCallbacks
    ): Promise<LlmGenerateResult> {
      const modelId = resolveModel(request.model)
      try {
        return await runAgentLoop(
          openrouter(modelId),
          modelId,
          request,
          cb,
          request.thinking ? { openrouter: { reasoning: { effort: 'high' } } } : undefined
        )
      } catch (err) {
        throw toLlmError(err, modelId)
      }
    }
  }
}
