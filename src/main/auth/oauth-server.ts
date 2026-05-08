import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'

export type CallbackResult =
  | { ok: true; code: string; state: string }
  | { ok: false; error: string; description?: string }

export type LoopbackHandle = {
  port: number
  redirectUri: string
  promise: Promise<CallbackResult>
  close: () => void
}

const SUCCESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Tuleap AI Companion</title>
<style>body{font-family:system-ui;background:#f8fafc;color:#0f172a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.card{background:white;padding:32px 40px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.06);text-align:center}
h1{margin:0 0 8px;font-size:20px}p{margin:0;color:#64748b}</style></head>
<body><div class="card"><h1>Connexion réussie ✓</h1><p>Vous pouvez fermer cet onglet et revenir dans l'application.</p></div></body></html>`

const ERROR_HTML = (msg: string): string => `<!doctype html>
<html><head><meta charset="utf-8"><title>Erreur</title>
<style>body{font-family:system-ui;background:#fef2f2;color:#7f1d1d;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.card{background:white;padding:32px 40px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.06);text-align:center;max-width:480px}
h1{margin:0 0 8px;font-size:20px}</style></head>
<body><div class="card"><h1>Authentification refusée</h1><p>${msg}</p></div></body></html>`

/**
 * Spin up a one-shot HTTP server on 127.0.0.1 that captures a single
 * /callback request, then resolves with the parsed code + state (or
 * the OAuth2 error). The OS picks a free port.
 */
export function startLoopbackOAuthServer(timeoutMs = 5 * 60_000): LoopbackHandle {
  let resolveFn!: (result: CallbackResult) => void
  let server: Server | undefined
  let timer: NodeJS.Timeout | undefined

  const promise = new Promise<CallbackResult>((resolve) => {
    resolveFn = resolve
  })

  server = createServer((req, res) => {
    if (!req.url) return
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname !== '/callback') {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
      return
    }
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state') ?? ''
    const error = url.searchParams.get('error')
    const description = url.searchParams.get('error_description') ?? undefined
    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(ERROR_HTML(error + (description ? ` — ${description}` : '')))
      resolveFn({ ok: false, error, description })
      return
    }
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(ERROR_HTML('Aucun code reçu.'))
      resolveFn({ ok: false, error: 'no_code' })
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(SUCCESS_HTML)
    resolveFn({ ok: true, code, state })
  })

  server.listen(0, '127.0.0.1')
  // Wait until listening to discover the chosen port.
  const handle: LoopbackHandle = {
    port: 0,
    redirectUri: '',
    promise,
    close: () => {
      if (timer) clearTimeout(timer)
      try {
        server?.close()
      } catch {
        /* swallow */
      }
    }
  }

  // The port + redirect URI are filled synchronously after listen() resolves
  // its initial 'listening' event, but Node assigns the port immediately —
  // we surface them via a tiny block.
  const address = server.address() as AddressInfo | string | null
  if (typeof address === 'object' && address) {
    handle.port = address.port
    handle.redirectUri = `http://127.0.0.1:${address.port}/callback`
  } else {
    server.on('listening', () => {
      const addr = server!.address() as AddressInfo | null
      if (addr) {
        handle.port = addr.port
        handle.redirectUri = `http://127.0.0.1:${addr.port}/callback`
      }
    })
  }

  timer = setTimeout(() => {
    resolveFn({ ok: false, error: 'timeout' })
    handle.close()
  }, timeoutMs)

  promise.finally(() => handle.close())

  return handle
}
