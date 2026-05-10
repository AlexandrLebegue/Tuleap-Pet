import { BrowserWindow } from 'electron'

export type LogLevel = 'log' | 'warn' | 'error'

export type LogEntry = {
  id: number
  level: LogLevel
  ts: number
  message: string
}

const DEBUG_CHANNEL = 'debug:log'
let seq = 0

function broadcast(entry: LogEntry): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(DEBUG_CHANNEL, entry)
    }
  }
}

function serializeArg(a: unknown): string {
  if (typeof a === 'string') return a
  if (a instanceof Error) {
    const e = a as unknown as Record<string, unknown>
    const parts: string[] = [`${a.name}: ${a.message}`]
    if (e['url']) parts.push(`url=${e['url']}`)
    if (e['statusCode'] !== undefined) parts.push(`status=${e['statusCode']}`)
    if (typeof e['responseBody'] === 'string' && e['responseBody']) {
      parts.push(`body=${(e['responseBody'] as string).slice(0, 400)}`)
    }
    if (a.cause instanceof Error) parts.push(`cause=${a.cause.message}`)
    return parts.join(' | ')
  }
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}

function fmt(...args: unknown[]): string {
  return args.map(serializeArg).join(' ')
}

function makeLogger(level: LogLevel) {
  return (...args: unknown[]): void => {
    const message = fmt(...args)
    console[level](message)
    broadcast({ id: ++seq, level, ts: Date.now(), message })
  }
}

export const debugLog = makeLogger('log')
export const debugWarn = makeLogger('warn')
export const debugError = makeLogger('error')
