import { debugError } from '../logger'
import type { GitRepositoryRaw } from './schemas'

/** Returns the first non-empty string value among the given keys. */
export function pickString(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = raw[k]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return ''
}

/**
 * Resolves a usable clone URL for a Tuleap git repository. Tuleap versions
 * disagree on the field name (and may omit it entirely), so we try every known
 * field and fall back to building the standard URL from the instance URL + path.
 */
export function resolveCloneUrl(
  r: GitRepositoryRaw,
  tuleapUrl: string | null,
  useSsh: boolean
): string {
  const raw = r as Record<string, unknown>

  if (useSsh) {
    const ssh =
      pickString(raw, 'clone_ssh_url', 'ssh_url') ||
      ((raw['clone_url'] as Record<string, unknown> | undefined)?.['ssh'] as string | undefined) ||
      ''
    if (ssh) return ssh

    const repoPath = pickString(raw, 'path').replace(/\.git$/, '')
    if (tuleapUrl && repoPath) {
      try {
        const host = new URL(tuleapUrl).hostname
        return `ssh://gitolite@${host}/${repoPath}.git`
      } catch {
        /* ignore */
      }
    }
  } else {
    const http =
      pickString(raw, 'clone_http_url', 'http_url', 'clone_http', 'repository_http_url') ||
      ((raw['clone_url'] as Record<string, unknown> | undefined)?.['http'] as string | undefined) ||
      ''
    if (http) return http

    const repoPath = pickString(raw, 'path').replace(/\.git$/, '')
    if (tuleapUrl && repoPath) {
      const base = tuleapUrl.replace(/\/+$/, '')
      return `${base}/plugins/git/${repoPath}.git`
    }
  }

  debugError(
    '[clone-url] Cannot resolve %s clone URL for repo "%s". Raw: %s',
    useSsh ? 'SSH' : 'HTTP',
    r.name,
    JSON.stringify(raw, null, 2).slice(0, 1000)
  )
  return ''
}
