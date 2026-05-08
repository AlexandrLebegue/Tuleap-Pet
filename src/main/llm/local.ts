import { generateText, streamText, stepCountIs, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { toLlmError } from './errors'
import type {
  LlmGenerateRequest,
  LlmGenerateResult,
  LlmMessage,
  LlmProvider,
  LlmStreamChunk,
  LlmUsage
} from './types'

export type LocalProviderOptions = {
  baseUrl: string
  model: string
  apiKey?: string | null
}

function toModelMessages(messages: LlmMessage[]): ModelMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }))
}

function toUsage(
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined
): LlmUsage | null {
  if (!usage) return null
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens
  }
}

export function createLocalProvider(opts: LocalProviderOptions): LlmProvider {
  if (!opts.baseUrl) throw new Error('createLocalProvider: baseUrl est requis.')
  if (!opts.model) throw new Error('createLocalProvider: model est requis.')

  const client = createOpenAI({
    baseURL: opts.baseUrl.replace(/\/$/, '') + '/v1',
    apiKey: opts.apiKey ?? 'local',
  })

  const modelId = opts.model.trim()

  return {
    name: 'local',

    async generate(request: LlmGenerateRequest): Promise<LlmGenerateResult> {
      const id = request.model?.trim() || modelId
      try {
        const result = await generateText({
          model: client(id),
          messages: toModelMessages(request.messages),
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          tools: request.tools,
          stopWhen: request.tools ? stepCountIs(request.maxSteps ?? 6) : undefined
        })
        return {
          text: result.text,
          model: id,
          finishReason: result.finishReason ?? null,
          usage: toUsage(result.usage)
        }
      } catch (err) {
        throw toLlmError(err, id)
      }
    },

    async stream(
      request: LlmGenerateRequest,
      onChunk: (chunk: LlmStreamChunk) => void
    ): Promise<LlmGenerateResult> {
      const id = request.model?.trim() || modelId
      try {
        const result = streamText({
          model: client(id),
          messages: toModelMessages(request.messages),
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          tools: request.tools,
          stopWhen: request.tools ? stepCountIs(request.maxSteps ?? 6) : undefined
        })

        let buffered = ''
        for await (const part of result.fullStream) {
          switch (part.type) {
            case 'text-delta': {
              const delta =
                (part as unknown as { text?: string; delta?: string }).text ??
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

        const finishReason = (await result.finishReason) ?? null
        const usage = toUsage(await result.usage)
        onChunk({ type: 'finish', finishReason, usage })

        return { text: buffered, model: id, finishReason, usage }
      } catch (err) {
        throw toLlmError(err, id)
      }
    }
  }
}
