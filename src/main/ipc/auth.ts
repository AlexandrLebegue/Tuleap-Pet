import { ipcMain } from 'electron'
import { audit } from '../store/db'
import {
  getConfig,
  getOAuthScope,
  setAuthMode,
  setOAuthClientId,
  setOAuthScope
} from '../store/config'
import { clearOAuthBundle, hasOAuthBundle, setOAuthBundle } from '../store/secrets'
import { runOAuthFlow } from '../auth/oauth'

export type StartOAuthResult =
  | { ok: true; scope: string | null; expiresAt: number | null }
  | { ok: false; error: string }

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:set-mode', (_event, mode: unknown) => {
    if (mode !== 'token' && mode !== 'oauth2') throw new Error('Mode invalide.')
    setAuthMode(mode)
    audit('auth.set-mode', mode)
    return { ok: true }
  })

  ipcMain.handle('auth:set-oauth-client', (_event, args: unknown) => {
    const opts = (args ?? {}) as { clientId?: string | null; scope?: string | null }
    setOAuthClientId(opts.clientId ?? null)
    setOAuthScope(opts.scope ?? null)
    audit('auth.set-oauth-client', opts.clientId ?? null)
    return { ok: true }
  })

  ipcMain.handle('auth:start-oauth', async (): Promise<StartOAuthResult> => {
    const config = getConfig()
    if (!config.tuleapUrl) return { ok: false, error: "URL Tuleap absente." }
    if (!config.oauthClientId) return { ok: false, error: 'Client OAuth2 non configuré.' }
    audit('auth.oauth.start')
    const result = await runOAuthFlow({
      baseUrl: config.tuleapUrl,
      clientId: config.oauthClientId,
      scope: getOAuthScope()
    })
    if (!result.ok) {
      audit('auth.oauth.error', result.error)
      return { ok: false, error: result.error }
    }
    setOAuthBundle({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
      scope: result.scope ?? getOAuthScope(),
      obtainedAt: Date.now()
    })
    audit('auth.oauth.success', null, { scope: result.scope, expiresAt: result.expiresAt })
    return { ok: true, scope: result.scope, expiresAt: result.expiresAt }
  })

  ipcMain.handle('auth:clear-oauth', () => {
    clearOAuthBundle()
    audit('auth.oauth.clear')
    return { ok: true }
  })

  ipcMain.handle('auth:has-oauth', () => {
    return { hasOAuth: hasOAuthBundle() }
  })
}
