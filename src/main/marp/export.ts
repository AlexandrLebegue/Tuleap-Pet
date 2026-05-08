import { marpCli } from '@marp-team/marp-cli'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export type PptxExportResult = {
  outputPath: string
}

/**
 * Resolve a Chromium binary path that marp-cli can drive for PPTX rendering.
 *
 * Preference order:
 *   1) MARP_CHROME_PATH or CHROME_PATH env var (escape hatch).
 *   2) puppeteer's bundled Chromium (~270 MB, fetched at install time).
 *   3) `null` → let marp-cli auto-detect a system Chrome / Chromium.
 *
 * Marp-cli's PPTX backend always needs a real Chromium, even with the
 * 'editable' mode. We do NOT try to use Electron's bundled Chromium
 * because Electron's binary doesn't accept Chrome's CLI / DevTools args.
 */
function resolveChromePath(): string | null {
  const fromEnv = process.env['MARP_CHROME_PATH'] ?? process.env['CHROME_PATH']
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim()
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
