import { TuleapClient, TuleapError } from '.'
import { getConfig } from '../store/config'
import { resolveTuleapAuth } from '../auth/resolver'

/**
 * Centralised builder used by every IPC handler that needs a TuleapClient.
 * Handles both auth modes (personal token + OAuth2 bearer) and the OAuth2
 * silent refresh by delegating to resolveTuleapAuth().
 */
export async function buildTuleapClient(): Promise<TuleapClient> {
  const { tuleapUrl } = getConfig()
  if (!tuleapUrl) {
    throw new TuleapError('unknown', "L'URL Tuleap n'est pas configurée.")
  }
  const auth = await resolveTuleapAuth()
  if (!auth) {
    throw new TuleapError(
      'auth',
      'Aucune authentification Tuleap : configurez un token personnel ou complétez la connexion OAuth2.'
    )
  }
  if (auth.mode === 'oauth2') {
    return new TuleapClient({
      baseUrl: tuleapUrl,
      token: auth.accessToken,
      authHeader: 'Authorization'
    })
  }
  return new TuleapClient({ baseUrl: tuleapUrl, token: auth.token })
}
