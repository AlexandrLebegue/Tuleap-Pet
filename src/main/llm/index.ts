import { getOpenRouterKey } from '../store/secrets'
import { getLlmModel } from '../store/config'
import { createOpenRouterProvider } from './openrouter'
import { LlmAuthError } from './errors'
import type { LlmProvider } from './types'

export {
  LlmAuthError,
  LlmError,
  LlmNetworkError,
  LlmRateLimitError,
  toLlmError
} from './errors'
export type { LlmErrorKind } from './errors'
export { createOpenRouterProvider } from './openrouter'
export { buildTuleapTools } from './tools'
export type {
  LlmGenerateRequest,
  LlmGenerateResult,
  LlmMessage,
  LlmProvider,
  LlmStreamChunk,
  LlmUsage
} from './types'

/**
 * Resolve the active LLM provider from the current persistent state.
 * Currently always OpenRouter — other providers (Ollama, OpenAI…) will
 * plug in here in later phases.
 */
export function resolveLlmProvider(): LlmProvider {
  const apiKey = getOpenRouterKey()
  if (!apiKey) {
    throw new LlmAuthError(
      "Aucune clé OpenRouter configurée. Renseignez-la dans Réglages ou via OPENROUTER_API_KEY."
    )
  }
  return createOpenRouterProvider({
    apiKey,
    defaultModel: getLlmModel()
  })
}
