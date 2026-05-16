import { getLocalLlmKey, getOpenRouterKey } from '../store/secrets'
import { debugLog } from '../logger'
import { getLocalBaseUrl, getLocalDirectConnection, getLocalModel, getLlmModel, getLlmProvider } from '../store/config'
import { createOpenRouterProvider } from './openrouter'
import { createLocalProvider } from './local'
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
export { createLocalProvider } from './local'
export { buildTuleapTools } from './tools'
export { buildTuleapWriteTools, applyWrite } from './write-tools'
export type { PendingWriteAction } from './write-tools'
export type {
  LlmGenerateRequest,
  LlmGenerateResult,
  LlmMessage,
  LlmProvider,
  LlmStreamChunk,
  LlmUsage
} from './types'

export function resolveLlmProvider(): LlmProvider {
  const provider = getLlmProvider()
  debugLog('[llm] resolveLlmProvider provider=%s', provider)

  if (provider === 'local') {
    const baseUrl = getLocalBaseUrl()
    const model = getLocalModel()
    debugLog('[llm] local baseUrl=%s model=%s', baseUrl, model)
    if (!baseUrl) {
      throw new LlmAuthError(
        "Aucune URL de base configurée pour le modèle local. Renseignez-la dans Réglages."
      )
    }
    if (!model) {
      throw new LlmAuthError(
        "Aucun modèle local configuré. Renseignez-le dans Réglages."
      )
    }
    return createLocalProvider({
      baseUrl,
      model,
      apiKey: getLocalLlmKey(),
      directConnection: getLocalDirectConnection()
    })
  }

  // Default: OpenRouter
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
