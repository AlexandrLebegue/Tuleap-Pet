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

/** A tool call or its result, surfaced live during the agentic loop. */
export type LlmToolEvent =
  | { kind: 'call'; toolName: string; toolCallId: string; args: unknown }
  | { kind: 'result'; toolName: string; toolCallId: string; result: unknown; error?: string }

/** Callbacks fired while runTools drives the multi-step tool loop. */
export type LlmAgentCallbacks = {
  /** Fired for every tool call and tool result, in order, as steps complete. */
  onToolEvent?: (event: LlmToolEvent) => void
  /** Fired with each chunk of assistant text as the model produces it. */
  onText?: (delta: string) => void
}

export interface LlmProvider {
  readonly name: string
  /** Single-shot generation, no tools. Used for summaries, titles, etc. */
  generate(request: LlmGenerateRequest): Promise<LlmGenerateResult>
  /**
   * Runs the full agentic loop: the model may call tools (executed by the AI
   * SDK), receive their results, and continue until it produces a final text
   * answer or maxSteps is reached. Returns the final answer. Tool calls/results
   * and text are surfaced live via callbacks.
   */
  runTools(request: LlmGenerateRequest, cb?: LlmAgentCallbacks): Promise<LlmGenerateResult>
}
