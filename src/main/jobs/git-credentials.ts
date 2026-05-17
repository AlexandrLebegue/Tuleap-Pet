import { buildTuleapClient } from '../tuleap/build'
import { getConfig } from '../store/config'
import { getTuleapToken, getOAuthBundle } from '../store/secrets'
import { debugError } from '../logger'

let cachedUsername: string | null = null

/**
 * Tuleap's HTTP git server requires the **actual user login** as basic-auth
 * username (not a placeholder like `x`) and a credential whose scope covers
 * git operations:
 * - In `token` mode the personal access key must have scope `write:git_repository`
 *   (`read:git_repository` is enough for read-only clones but the app also
 *   pushes branches, so we ask for write).
 * - In `oauth2` mode the bearer token also has to grant git scope.
 *
 * Returns the original URL if the username can't be resolved (no token, no
 * network), letting git surface the auth error directly.
 */
export async function injectGitCredentials(cloneUrl: string): Promise<string> {
  if (!cloneUrl.startsWith('http')) return cloneUrl

  const token = getActiveToken()
  if (!token) return cloneUrl

  const username = await resolveUsername()
  if (!username) return cloneUrl

  try {
    const url = new URL(cloneUrl)
    url.username = encodeURIComponent(username)
    url.password = encodeURIComponent(token)
    return url.toString()
  } catch {
    return cloneUrl
  }
}

function getActiveToken(): string | null {
  const { authMode } = getConfig()
  if (authMode === 'oauth2') {
    const oauth = getOAuthBundle()?.accessToken
    if (oauth) return oauth
  }
  return getTuleapToken()
}

async function resolveUsername(): Promise<string | null> {
  if (cachedUsername) return cachedUsername
  try {
    const client = await buildTuleapClient()
    const me = await client.getSelf()
    if (me.username) {
      cachedUsername = me.username
      return me.username
    }
    return null
  } catch (err) {
    debugError('[git-credentials] resolveUsername failed: %s', err instanceof Error ? err.message : String(err))
    return null
  }
}

/** For tests: reset the cached username. */
export function _resetGitCredentialsCacheForTests(): void {
  cachedUsername = null
}

const AUTH_FAILURE_HINTS = [
  /authentication failed/i,
  /could not read username/i,
  /could not read password/i,
  /403\s+forbidden/i,
  /401\s+unauthorized/i
]

/**
 * Returns a user-actionable error message if `gitErr` looks like a Tuleap git
 * auth failure (token scope missing, wrong credentials), else null.
 */
export function explainGitAuthFailure(gitErr: string): string | null {
  if (!AUTH_FAILURE_HINTS.some((r) => r.test(gitErr))) return null
  return (
    "Tuleap a refusé l'authentification git. Vérifie que ton access key " +
    'inclut le scope `write:git_repository` (ou `read:git_repository` pour ' +
    'un clone) — les clés avec uniquement `write:rest` ne fonctionnent pas ' +
    "pour git. En mode OAuth2 ton bearer doit aussi couvrir git. Détail brut : " +
    gitErr
  )
}
