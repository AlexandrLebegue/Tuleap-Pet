import { getConfig, getOAuthScope } from '../store/config'
import {
  clearOAuthBundle,
  getOAuthBundle,
  getTuleapToken,
  setOAuthBundle
} from '../store/secrets'
import { refreshOAuthToken } from './oauth'

export type ResolvedAuth =
  | { mode: 'token'; token: string }
  | { mode: 'oauth2'; accessToken: string }

const REFRESH_LEEWAY_MS = 60_000

/**
 * Resolve the credentials used by the Tuleap client. Honours the configured
 * auth mode: personal access token by default, OAuth2 access token when the
 * user has gone through the PKCE flow. Refreshes the access token via
 * refresh_token when within REFRESH_LEEWAY_MS of expiration.
 */
export async function resolveTuleapAuth(): Promise<ResolvedAuth | null> {
  const config = getConfig()
  if (config.authMode === 'oauth2') {
    if (!config.tuleapUrl || !config.oauthClientId) return null
    let bundle = getOAuthBundle()
    if (!bundle) return null
    if (bundle.expiresAt && bundle.expiresAt - REFRESH_LEEWAY_MS < Date.now()) {
      if (!bundle.refreshToken) {
        // expired without a refresh token: drop and force re-auth
        clearOAuthBundle()
        return null
      }
      const refreshed = await refreshOAuthToken(
        { baseUrl: config.tuleapUrl, clientId: config.oauthClientId },
        bundle.refreshToken
      )
      if (!refreshed.ok) {
        clearOAuthBundle()
        return null
      }
      bundle = {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
        scope: refreshed.scope ?? getOAuthScope(),
        obtainedAt: Date.now()
      }
      setOAuthBundle(bundle)
    }
    return { mode: 'oauth2', accessToken: bundle.accessToken }
  }

  const token = getTuleapToken()
  if (!token) return null
  return { mode: 'token', token }
}
