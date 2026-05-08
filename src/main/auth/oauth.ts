import { shell } from 'electron'
import { generatePkceVerifier, pkceChallengeS256, generateState } from './pkce'
import { startLoopbackOAuthServer } from './oauth-server'

export type OAuthResult =
  | {
      ok: true
      accessToken: string
      refreshToken: string | null
      expiresAt: number | null // epoch ms
      scope: string | null
    }
  | { ok: false; error: string }

export type OAuthConfig = {
  /** Tuleap base URL, e.g. https://tuleap.example.com */
  baseUrl: string
  /** OAuth2 application client id registered on Tuleap. */
  clientId: string
  /** Space-separated scopes, e.g. 'read:user_membership read:project read:tracker'. */
  scope: string
}

const AUTHORIZE_PATH = '/oauth2/authorize'
const TOKEN_PATH = '/oauth2/token'

/**
 * Drive the full OAuth2 Authorization Code + PKCE flow:
 *  1. Spin up a loopback HTTP server, derive the redirect_uri from its port.
 *  2. Open the system browser at /oauth2/authorize with PKCE challenge.
 *  3. Wait for the user to grant access; the browser is redirected to
 *     http://127.0.0.1:PORT/callback?code=…&state=….
 *  4. Exchange the code for an access + refresh token (code_verifier).
 */
export async function runOAuthFlow(config: OAuthConfig): Promise<OAuthResult> {
  if (!config.baseUrl || !config.clientId) {
    return { ok: false, error: 'Configuration OAuth2 incomplète.' }
  }

  const verifier = generatePkceVerifier()
  const challenge = pkceChallengeS256(verifier)
  const state = generateState()
  const server = startLoopbackOAuthServer()
  // Allow a microtask for the listening event to fill redirectUri if needed.
  await new Promise((r) => setImmediate(r))
  if (!server.redirectUri) {
    return { ok: false, error: 'Impossible de démarrer le serveur loopback.' }
  }

  const authorizeUrl = new URL(AUTHORIZE_PATH, config.baseUrl)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', config.clientId)
  authorizeUrl.searchParams.set('redirect_uri', server.redirectUri)
  authorizeUrl.searchParams.set('scope', config.scope || 'read:user_membership read:project')
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', challenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')

  await shell.openExternal(authorizeUrl.toString())

  const callback = await server.promise
  if (!callback.ok) {
    return { ok: false, error: callback.error + (callback.description ? `: ${callback.description}` : '') }
  }
  if (callback.state !== state) {
    return { ok: false, error: 'Mismatch sur le paramètre state — possible CSRF.' }
  }

  // Exchange the code.
  const tokenUrl = new URL(TOKEN_PATH, config.baseUrl).toString()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: callback.code,
    redirect_uri: server.redirectUri,
    client_id: config.clientId,
    code_verifier: verifier
  })

  let tokenResponse: Response
  try {
    tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body
    })
  } catch (err) {
    return { ok: false, error: `Impossible de joindre Tuleap : ${err instanceof Error ? err.message : String(err)}` }
  }

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text().catch(() => '')
    return {
      ok: false,
      error: `Tuleap a refusé l'échange (HTTP ${tokenResponse.status}) : ${text.slice(0, 300)}`
    }
  }

  let payload: {
    access_token?: string
    refresh_token?: string | null
    expires_in?: number
    scope?: string
  }
  try {
    payload = (await tokenResponse.json()) as typeof payload
  } catch {
    return { ok: false, error: 'Réponse OAuth2 illisible.' }
  }
  if (!payload.access_token) {
    return { ok: false, error: 'Aucun access_token dans la réponse OAuth2.' }
  }
  return {
    ok: true,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt: payload.expires_in ? Date.now() + payload.expires_in * 1000 : null,
    scope: payload.scope ?? null
  }
}

/**
 * Use the refresh_token to obtain a fresh access token without re-prompting
 * the user. Returns a new OAuthResult.
 */
export async function refreshOAuthToken(
  config: Pick<OAuthConfig, 'baseUrl' | 'clientId'>,
  refreshToken: string
): Promise<OAuthResult> {
  const tokenUrl = new URL(TOKEN_PATH, config.baseUrl).toString()
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId
  })
  let response: Response
  try {
    response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body
    })
  } catch (err) {
    return { ok: false, error: `Refresh: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (!response.ok) {
    return { ok: false, error: `Refresh refusé (HTTP ${response.status}).` }
  }
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string | null
    expires_in?: number
    scope?: string
  }
  if (!payload.access_token) {
    return { ok: false, error: 'Refresh: aucun access_token retourné.' }
  }
  return {
    ok: true,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? refreshToken,
    expiresAt: payload.expires_in ? Date.now() + payload.expires_in * 1000 : null,
    scope: payload.scope ?? null
  }
}
