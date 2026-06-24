import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { getSvnPath } from '../store/config'
import { debugError } from '../logger'
import { parseSvnList, parseSvnLog, parseSvnInfo } from './svn-xml'
import type { SvnPathEntry, SvnCommit, SvnInfo } from './svn-xml'

export type { SvnPathEntry, SvnCommit, SvnInfo } from './svn-xml'
export { parseSvnList, parseSvnLog, parseSvnInfo } from './svn-xml'

const execFileAsync = promisify(execFile)

/** Source extensions mirrored from the git commenter (C/C++ only, case-insensitive). */
const SOURCE_EXT = /\.(c|h|cpp|hpp|cxx|hxx|cc)$/i

/** Well-known install paths to probe when `svn` isn't on the PATH (TortoiseSVN). */
const SVN_FALLBACK_PATHS = [
  'C:\\Program Files\\TortoiseSVN\\bin\\svn.exe',
  'C:\\Program Files (x86)\\TortoiseSVN\\bin\\svn.exe',
  'C:\\Program Files\\SlikSvn\\bin\\svn.exe'
]

/**
 * Resolve the `svn` executable. Priority:
 *  1. explicit `svnPath` configured in Réglages,
 *  2. a known TortoiseSVN / SlikSVN install path that exists on disk,
 *  3. bare `svn` (relies on the PATH).
 *
 * TortoiseSVN ships the command-line client as an **optional** installer
 * component, so it is frequently absent from the PATH — hence the probing.
 */
export function resolveSvnBinary(): string {
  const configured = getSvnPath()
  if (configured && configured.trim().length > 0) return configured.trim()
  for (const p of SVN_FALLBACK_PATHS) {
    if (existsSync(p)) return p
  }
  return 'svn'
}

export class SvnError extends Error {
  constructor(
    message: string,
    readonly stderr: string
  ) {
    super(message)
    this.name = 'SvnError'
  }
}

/**
 * Run `svn <args>`. `--non-interactive` is always injected so the CLI never
 * blocks waiting on a prompt (auth, cert trust). Credentials, when needed, are
 * supplied by the caller via {@link buildSvnAuthArgs}.
 */
export async function execSvn(args: string[], cwd?: string): Promise<string> {
  const bin = resolveSvnBinary()
  const full = ['--non-interactive', ...args]
  try {
    const { stdout } = await execFileAsync(bin, full, {
      cwd,
      maxBuffer: 50 * 1024 * 1024,
      windowsHide: true
    })
    return stdout
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string; code?: string }
    if (e.code === 'ENOENT') {
      throw new SvnError(
        "Le binaire 'svn' est introuvable. Installez les « command line client tools » " +
          'de TortoiseSVN (ou renseignez le chemin de svn.exe dans les Réglages).',
        e.stderr ?? ''
      )
    }
    const detail = e.stderr?.trim() || e.message || String(err)
    throw new SvnError(`svn ${args[0] ?? ''} a échoué : ${detail}`, e.stderr ?? '')
  }
}

// ─── High-level operations ────────────────────────────────────────────────────

/** List immediate children of an SVN URL (used for trunk/branches/tags browsing). */
export async function svnList(url: string, authArgs: string[] = []): Promise<SvnPathEntry[]> {
  const out = await execSvn(['list', '--xml', ...authArgs, url])
  return parseSvnList(out)
}

/** Read up to `limit` log entries for an SVN URL (no checkout required). */
export async function svnLog(
  url: string,
  opts?: { limit?: number; authArgs?: string[] }
): Promise<SvnCommit[]> {
  const limit = opts?.limit ?? 30
  const out = await execSvn([
    'log',
    '--xml',
    '--limit',
    String(limit),
    ...(opts?.authArgs ?? []),
    url
  ])
  return parseSvnLog(out)
}

/** `svn info --xml` for a URL or working copy path. */
export async function svnInfo(target: string, authArgs: string[] = []): Promise<SvnInfo | null> {
  const out = await execSvn(['info', '--xml', ...authArgs, target])
  return parseSvnInfo(out)
}

/** Checkout `url` into `dir`. Returns the checked-out revision (or null). */
export async function svnCheckout(
  url: string,
  dir: string,
  authArgs: string[] = []
): Promise<number | null> {
  await execSvn(['checkout', ...authArgs, url, dir])
  const info = await svnInfo(dir, authArgs).catch(() => null)
  return info?.revision ?? null
}

/**
 * Unified diff of the local modifications in a working copy. This is the patch
 * we hand back to the user (the "generate a patch" workflow — never committed).
 */
export async function svnDiff(workingCopy: string): Promise<string> {
  // `--internal-diff` avoids depending on an external diff tool being on PATH.
  return execSvn(['diff', '--internal-diff', '.'], workingCopy)
}

/** Relative paths of C/C++ source files in a working copy (excludes `.svn`). */
export function listSvnSourceFiles(workingCopy: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (err) {
      debugError('[svn-utils] readdir failed for %s: %s', dir, String(err))
      return
    }
    for (const e of entries) {
      if (e.name === '.svn') continue
      const full = join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.isFile() && SOURCE_EXT.test(e.name)) {
        out.push(relative(workingCopy, full).split(sep).join('/'))
      }
    }
  }
  walk(workingCopy)
  return out.sort()
}
