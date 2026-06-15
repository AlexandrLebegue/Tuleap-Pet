import { generateText, stepCountIs, type LanguageModel, type ModelMessage } from 'ai'
import type { ProviderOptions } from '@ai-sdk/provider-utils'
import { debugLog } from '../logger'
import type { LlmAgentCallbacks, LlmGenerateRequest, LlmGenerateResult, LlmUsage } from './types'

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

/**
 * Drives the AI SDK's multi-step tool loop and returns the final text answer.
 *
 * Unlike streaming, generateText fully resolves each step (model call → tool
 * execution → model call …) before continuing, which is far more reliable for
 * weak local models. Tool calls/results and text are surfaced live through
 * `onStepFinish` so the UI updates as the loop progresses.
 *
 * The single source of truth for the answer is `result.text`. There is no
 * synthesis fallback or heuristic — if the model ends without text we report it
 * plainly to the caller.
 */
export async function runAgentLoop(
  model: LanguageModel,
  modelId: string,
  request: LlmGenerateRequest,
  cb?: LlmAgentCallbacks,
  providerOptions?: ProviderOptions
): Promise<LlmGenerateResult> {
  const messages = request.messages.map(
    (m) => ({ role: m.role, content: m.content }) satisfies ModelMessage
  )

  let streamedLen = 0

  const result = await generateText({
    model,
    messages,
    temperature: request.thinking ? undefined : request.temperature,
    maxOutputTokens: request.maxOutputTokens,
    tools: request.tools,
    stopWhen: request.tools ? stepCountIs(request.maxSteps ?? 6) : undefined,
    providerOptions,
    onStepFinish: (step) => {
      // Surface tool calls then their results, in order.
      for (const call of step.toolCalls ?? []) {
        const c = call as unknown as { toolName: string; toolCallId: string; input?: unknown; args?: unknown }
        cb?.onToolEvent?.({
          kind: 'call',
          toolName: c.toolName,
          toolCallId: c.toolCallId,
          args: c.input ?? c.args
        })
      }
      for (const res of step.toolResults ?? []) {
        const r = res as unknown as { toolName: string; toolCallId: string; output?: unknown; result?: unknown }
        cb?.onToolEvent?.({
          kind: 'result',
          toolName: r.toolName,
          toolCallId: r.toolCallId,
          result: r.output ?? r.result
        })
      }
      // Surface any text this step produced (usually only the final step).
      if (step.text) {
        cb?.onText?.(step.text)
        streamedLen += step.text.length
      }
    }
  })

  const finalText = result.text ?? ''
  // If the final aggregated text is longer than what we streamed per-step
  // (rare provider quirk), emit the remainder so the UI shows the full answer.
  if (cb?.onText && finalText.length > streamedLen) {
    cb.onText(finalText.slice(streamedLen))
  }

  const finishReason = result.finishReason ?? null
  const usage = toUsage(result.usage)
  debugLog('[agent] loop done model=%s steps=%d finishReason=%s textLen=%d',
    modelId, result.steps?.length ?? 0, finishReason, finalText.length)

  return { text: finalText, model: modelId, finishReason, usage }
}
