import { BrowserWindow, dialog, ipcMain } from 'electron'
import { audit } from '../store/db'
import { buildArtifactContext } from '../coder/context'
import { killCoder, spawnCoder } from '../coder/runner'
import { getConfig, setOpenCodeBinary } from '../store/config'
import type { CoderContextResult, CoderStreamEvent } from '@shared/types'

const STREAM_CHANNEL = 'coder:stream'

function broadcast(senderId: number, event: CoderStreamEvent): void {
  const win = BrowserWindow.fromId(senderId)
  if (win && !win.isDestroyed()) {
    win.webContents.send(STREAM_CHANNEL, event)
  }
}

export function registerCoderHandlers(): void {
  ipcMain.handle(
    'coder:build-context',
    async (_event, artifactId: unknown): Promise<CoderContextResult> => {
      if (
        typeof artifactId !== 'number' ||
        !Number.isInteger(artifactId) ||
        artifactId <= 0
      ) {
        throw new Error('artifactId invalide.')
      }
      audit('coder.build-context', String(artifactId))
      return buildArtifactContext(artifactId)
    }
  )

  ipcMain.handle('coder:set-binary', (_event, args: unknown) => {
    const opts = (args ?? {}) as { path?: string | null }
    setOpenCodeBinary(opts.path ?? null)
    audit('coder.set-binary', opts.path ?? null)
    return { ok: true, path: opts.path ?? null }
  })

  ipcMain.handle('coder:choose-cwd', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const result = await dialog.showOpenDialog(win as BrowserWindow, {
      title: 'Dossier de travail pour OpenCode',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, cancelled: true as const }
    }
    return { ok: true as const, path: result.filePaths[0] ?? null }
  })

  ipcMain.handle(
    'coder:run',
    async (
      event,
      args: unknown
    ): Promise<{ ok: true; sessionId: string; pid: number } | { ok: false; error: string }> => {
      const opts = (args ?? {}) as {
        prompt?: string
        cwd?: string | null
        binaryPath?: string | null
        extraArgs?: string[]
      }
      if (typeof opts.prompt !== 'string' || opts.prompt.trim().length === 0) {
        return { ok: false, error: 'Prompt vide.' }
      }
      const binary = opts.binaryPath?.trim() || getConfig().openCodeBinary || 'opencode'
      const win = BrowserWindow.fromWebContents(event.sender)
      const senderId = win?.id ?? -1

      audit('coder.run.start', binary, {
        promptLength: opts.prompt.length,
        cwd: opts.cwd ?? null
      })

      const result = spawnCoder({
        binaryPath: binary,
        prompt: opts.prompt,
        cwd: opts.cwd ?? null,
        extraArgs: opts.extraArgs,
        onEvent: (e) => broadcast(senderId, e)
      })

      if (!result.ok) {
        audit('coder.run.spawn-error', binary, { error: result.error })
        return { ok: false, error: result.error }
      }
      return { ok: true, sessionId: result.sessionId, pid: result.pid }
    }
  )

  ipcMain.handle('coder:kill', (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string') throw new Error('sessionId invalide.')
    audit('coder.kill', sessionId)
    return { ok: killCoder(sessionId) }
  })
}
