import { generateText, streamText, stepCountIs, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { net, session } from 'electron'
import { toLlmError } from './errors'
import { debugLog, debugError } from '../logger'
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
  directConnection?: boolean
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

  const baseURL = opts.baseUrl.replace(/\/+$/, '')
  const direct = opts.directConnection ?? true
  debugLog('[local-llm] createLocalProvider baseURL=%s model=%s direct=%s', baseURL, opts.model, direct)

  // direct=true  → dedicated session with proxy disabled (bypasses corporate proxies)
  // direct=false → net.fetch which uses system proxy settings
  const loggingFetch: typeof globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const reqHeaders = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}))
    const safeHeaders: Record<string, string> = {}
    reqHeaders.forEach((v, k) => {
      safeHeaders[k] = k === 'authorization' || k === 'x-api-key' ? '[redacted]' : v
    })
    debugLog('[local-llm] → %s %s direct=%s req-headers=%s', method, url, direct, JSON.stringify(safeHeaders))
    const fetchFn = direct
      ? session.fromPartition('local-llm-direct').fetch.bind(session.fromPartition('local-llm-direct'))
      : net.fetch.bind(net)
    const response = await fetchFn(url, init as RequestInit)
    const resHeaders: Record<string, string> = {}
    response.headers.forEach((v, k) => { resHeaders[k] = v })
    debugLog('[local-llm] ← %s %s res-headers=%s', response.status, response.statusText, JSON.stringify(resHeaders))
    return response as unknown as Response
  }

  const client = createOpenAI({
    baseURL,
    apiKey: opts.apiKey ?? 'local',
    fetch: loggingFetch,
  })

  const modelId = opts.model.trim()

  return {
    name: 'local',

    async generate(request: LlmGenerateRequest): Promise<LlmGenerateResult> {
      const id = request.model?.trim() || modelId
      debugLog('[local-llm] generate → POST %s/chat/completions model=%s', baseURL, id)
      try {
        const result = await generateText({
          model: client.chat(id),
          messages: toModelMessages(request.messages),
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          tools: request.tools,
          stopWhen: request.tools ? stepCountIs(request.maxSteps ?? 6) : undefined
        })
        debugLog('[local-llm] generate OK finishReason=%s tokens=%o', result.finishReason, result.usage)
        return {
          text: result.text,
          model: id,
          finishReason: result.finishReason ?? null,
          usage: toUsage(result.usage)
        }
      } catch (err) {
        const e = err as Record<string, unknown>
        debugError(
          '[local-llm] generate ERROR status=%s url=%s body=%s msg=%s',
          e?.['statusCode'] ?? e?.['status'] ?? '?',
          e?.['url'] ?? '?',
          typeof e?.['responseBody'] === 'string'
            ? (e['responseBody'] as string).slice(0, 400)
            : '?',
          err instanceof Error ? err.message : String(err)
        )
        throw toLlmError(err, id)
      }
    },

    async stream(
      request: LlmGenerateRequest,
      onChunk: (chunk: LlmStreamChunk) => void
    ): Promise<LlmGenerateResult> {
      const id = request.model?.trim() || modelId
      debugLog('[local-llm] stream → POST %s/chat/completions model=%s', baseURL, id)
      try {
        const result = streamText({
          model: client.chat(id),
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

        debugLog('[local-llm] stream OK finishReason=%s tokens=%o sdkText=%d buffered=%d',
          finishReason, usage, sdkText.length, buffered.length)
        return { text: finalText, model: id, finishReason, usage }
      } catch (err) {
        const e = err as Record<string, unknown>
        debugError(
          '[local-llm] stream ERROR status=%s url=%s body=%s msg=%s',
          e?.['statusCode'] ?? e?.['status'] ?? '?',
          e?.['url'] ?? '?',
          typeof e?.['responseBody'] === 'string'
            ? (e['responseBody'] as string).slice(0, 400)
            : '?',
          err instanceof Error ? err.message : String(err)
        )
        throw toLlmError(err, id)
      }
    }
  }
}
