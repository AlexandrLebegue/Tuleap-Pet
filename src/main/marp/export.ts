import { marpCli } from '@marp-team/marp-cli'
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export type PptxExportResult = {
  outputPath: string
}

/**
 * Locate the `chrome-headless-shell` binary inside a puppeteer cache root.
 * Layout: `<root>/chrome-headless-shell/<build>/chrome-headless-shell-<platform>/chrome-headless-shell[.exe]`
 * The build + platform folders are version-specific, so we walk them.
 */
function findHeadlessShell(cacheRoot: string): string | null {
  const base = join(cacheRoot, 'chrome-headless-shell')
  if (!existsSync(base)) return null
  const exe = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell'
  let builds: string[]
  try {
    builds = readdirSync(base)
  } catch {
    return null
  }
  for (const build of builds) {
    let platDirs: string[]
    try {
      platDirs = readdirSync(join(base, build))
    } catch {
      continue
    }
    for (const platDir of platDirs) {
      const candidate = join(base, build, platDir, exe)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

/**
 * Resolve a Chromium binary path that marp-cli can drive for PPTX rendering.
 *
 * Preference order:
 *   1) MARP_CHROME_PATH or CHROME_PATH env var (escape hatch).
 *   2) Bundled chrome-headless-shell, copied next to the packaged app by
 *      electron-builder (`extraResources` → `process.resourcesPath/puppeteer-cache`).
 *   3) Project-local `.puppeteer-cache` (dev / tests, see `.puppeteerrc.cjs`).
 *   4) puppeteer's default Chromium in the user cache (last-resort fallback).
 *   5) `null` → let marp-cli auto-detect a system Chrome / Chromium.
 *
 * Marp-cli's PPTX backend always needs a real Chromium. We do NOT reuse
 * Electron's bundled Chromium because its binary doesn't accept Chrome's
 * CLI / DevTools args.
 */
function resolveChromePath(): string | null {
  const fromEnv = process.env['MARP_CHROME_PATH'] ?? process.env['CHROME_PATH']
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim()

  // Packaged app: extraResources copies .puppeteer-cache → resources/puppeteer-cache
  const resourcesPath = process.resourcesPath
  if (resourcesPath) {
    const bundled = findHeadlessShell(join(resourcesPath, 'puppeteer-cache'))
    if (bundled) return bundled
  }

  // Dev / tests: the project-local cache populated by `.puppeteerrc.cjs`
  const devCache = findHeadlessShell(join(process.cwd(), '.puppeteer-cache'))
  if (devCache) return devCache

  try {
    // Lazy require: keeps the dependency graph optional and lets the
    // app degrade gracefully if puppeteer's Chromium download was skipped.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require('puppeteer') as { executablePath: () => string }
    const exec = puppeteer.executablePath()
    if (exec && existsSync(exec)) return exec
  } catch {
    /* puppeteer not present or no bundled Chromium: fall through to auto */
  }
  return null
}

/**
 * Convert a Marp Markdown string to a .pptx file at `outputPath`.
 *
 * marp-cli is invoked through its programmatic API, so no subprocess is
 * spawned and the integration ships self-contained inside the Electron
 * main bundle. PPTX rendering still requires Chromium — see
 * resolveChromePath() — so the README documents the puppeteer dependency.
 */
export async function exportMarpPptx(
  markdown: string,
  outputPath: string
): Promise<PptxExportResult> {
  if (!outputPath) {
    throw new Error('Aucun chemin de sortie fourni pour l’export PPTX.')
  }

  const workdir = mkdtempSync(join(tmpdir(), 'tuleap-marp-'))
  const inputPath = join(workdir, 'sprint-review.md')
  writeFileSync(inputPath, markdown, 'utf8')

  const argv = ['--pptx', '--allow-local-files', '-o', outputPath, inputPath]
  const chromePath = resolveChromePath()
  if (chromePath) {
    argv.unshift('--browser-path', chromePath)
  }

  let exitCode = 1
  try {
    exitCode = await marpCli(argv)
  } finally {
    try {
      rmSync(workdir, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  }

  if (exitCode !== 0) {
    throw new Error(
      `marp-cli a renvoyé le code ${exitCode}. Vérifiez qu'un binaire Chromium est disponible (puppeteer ou CHROME_PATH).`
    )
  }
  if (!existsSync(outputPath)) {
    throw new Error(`Le fichier de sortie ${outputPath} n'a pas été créé.`)
  }
  return { outputPath }
}
