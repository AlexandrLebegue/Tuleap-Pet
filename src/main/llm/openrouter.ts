import { generateText, streamText, stepCountIs, type ModelMessage } from 'ai'
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

    async stream(
      request: LlmGenerateRequest,
      onChunk: (chunk: LlmStreamChunk) => void
    ): Promise<LlmGenerateResult> {
      const modelId = resolveModel(request.model)
      try {
        const result = streamText({
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

        let buffered = ''
        for await (const part of result.fullStream) {
          switch (part.type) {
            case 'text-delta': {
              const delta =
                (part as unknown as { textDelta?: string }).textDelta ??
                (part as unknown as { text?: string }).text ??
                (part as unknown as { delta?: string }).delta ??
                ''
              if (delta) {
                buffered += delta
                onChunk({ type: 'text', delta })
              }
              break
            }
            case 'tool-call': {
              const tc = part as unknown as {
                toolName: string
                toolCallId: string
                input?: unknown
                args?: unknown
              }
              onChunk({
                type: 'tool-call',
                toolName: tc.toolName,
                toolCallId: tc.toolCallId,
                args: tc.input ?? tc.args
              })
              break
            }
            case 'tool-result': {
              const tr = part as unknown as {
                toolName: string
                toolCallId: string
                output?: unknown
                result?: unknown
                error?: string
              }
              onChunk({
                type: 'tool-result',
                toolName: tr.toolName,
                toolCallId: tr.toolCallId,
                result: tr.output ?? tr.result,
                error: tr.error
              })
              break
            }
            case 'error': {
              const e = part as unknown as { error: unknown }
              throw e.error ?? new Error('Erreur de streaming inconnue')
            }
            default:
              break
          }
        }

        // Use the SDK's assembled text as authoritative source — it includes
        // text from ALL steps in multi-step tool calling, even if some
        // text-delta events were not captured during streaming.
        const sdkText = await result.text
        const finalText = sdkText || buffered
        const finishReason = (await result.finishReason) ?? null
        const usage = toUsage(await result.usage)
        onChunk({ type: 'finish', finishReason, usage })

        return { text: finalText, model: modelId, finishReason, usage }
      } catch (err) {
        throw toLlmError(err, modelId)
      }
    }
  }
}
