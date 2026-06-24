import { buildTuleapClient } from '../tuleap/build'
import { getConfig } from '../store/config'
import { getTuleapToken, getOAuthBundle } from '../store/secrets'
import { debugError } from '../logger'

let cachedUsername: string | null = null

/**
 * Build the auth CLI flags for an HTTP(S) Tuleap SVN URL. Tuleap serves SVN over
 * HTTP under `/svnplugin/...` using the same Tuleap identity as git: the user
 * login + a personal access key (scope covering SVN), or the OAuth2 bearer.
 *
 * Returns an empty array for non-HTTP URLs (e.g. local `file://` repos in tests)
 * or when no credential is available — letting svn surface the auth error.
 *
 * `--no-auth-cache` keeps the token out of `~/.subversion/auth`.
 */
export async function buildSvnAuthArgs(url: string): Promise<string[]> {
  if (!/^https?:\/\//i.test(url)) return []

  const token = getActiveToken()
  if (!token) return []

  const username = await resolveUsername()
  if (!username) return []

  return [
    '--username',
    username,
    '--password',
    token,
    '--no-auth-cache',
    '--trust-server-cert-failures',
    'unknown-ca,cn-mismatch,expired,not-yet-valid,other'
  ]
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
    debugError(
      '[svn-credentials] resolveUsername failed: %s',
      err instanceof Error ? err.message : String(err)
    )
    return null
  }
}

/** For tests: reset the cached username. */
export function _resetSvnCredentialsCacheForTests(): void {
  cachedUsername = null
}

const AUTH_FAILURE_HINTS = [
  /authorization failed/i,
  /authentication failed/i,
  /could not authenticate/i,
  /403\s+forbidden/i,
  /401\s+unauthorized/i,
  /E170001/ // svn: authorization failed
]

/**
 * Returns a user-actionable message if `svnErr` looks like a Tuleap SVN auth
 * failure (token scope / wrong credentials), else null.
 */
export function explainSvnAuthFailure(svnErr: string): string | null {
  if (!AUTH_FAILURE_HINTS.some((r) => r.test(svnErr))) return null
  return (
    "Tuleap a refusé l'authentification SVN. Vérifie que ton access key Tuleap " +
    'couvre le plugin SVN (ou utilise un SVN token dédié si ton instance en exige un). ' +
    'En mode OAuth2 ton bearer doit aussi couvrir SVN. Détail brut : ' +
    svnErr
  )
}
