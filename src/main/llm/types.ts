import type { Tool } from 'ai'

export type LlmMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }

export type LlmGenerateRequest = {
  model?: string
  messages: LlmMessage[]
  temperature?: number
  maxOutputTokens?: number
  tools?: Record<string, Tool>
  /** Maximum number of tool-calling rounds (default: 6). */
  maxSteps?: number
  /** Enable extended thinking / reasoning (model-dependent). */
  thinking?: boolean
}

export type LlmUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export type LlmGenerateResult = {
  text: string
  model: string
  finishReason: string | null
  usage: LlmUsage | null
}

export type LlmStreamChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool-call'; toolName: string; toolCallId: string; args: unknown }
  | { type: 'tool-result'; toolName: string; toolCallId: string; result: unknown; error?: string }
  | { type: 'finish'; finishReason: string | null; usage: LlmUsage | null }

export interface LlmProvider {
  readonly name: string
  generate(request: LlmGenerateRequest): Promise<LlmGenerateResult>
  stream(
    request: LlmGenerateRequest,
    onChunk: (chunk: LlmStreamChunk) => void
  ): Promise<LlmGenerateResult>
}
