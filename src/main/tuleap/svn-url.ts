import type { SvnRepositoryRaw } from './schemas'

/** Returns the first non-empty string value among the given keys. */
function pickString(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = raw[k]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return ''
}

/**
 * Resolve a usable checkout URL for a Tuleap SVN repository. Tuleap versions
 * disagree on the field name (and may omit it entirely), so we try every known
 * field and fall back to the standard SVN plugin URL built from the instance URL
 * + the project short name + the repository name:
 *   `<instance>/svnplugin/<project_shortname>/<repo_name>`
 *
 * Returns '' when nothing usable can be derived (the caller surfaces the error).
 */
export function resolveSvnUrl(r: SvnRepositoryRaw, tuleapUrl: string | null): string {
  const raw = r as Record<string, unknown>

  const direct = pickString(raw, 'svn_url', 'http_url', 'url')
  if (direct) return direct

  const shortname =
    r.project && typeof r.project === 'object'
      ? pickString(r.project as Record<string, unknown>, 'shortname', 'label')
      : ''

  if (tuleapUrl && shortname && r.name) {
    const base = tuleapUrl.replace(/\/+$/, '')
    return `${base}/svnplugin/${encodeURIComponent(shortname)}/${encodeURIComponent(r.name)}`
  }

  return ''
}
