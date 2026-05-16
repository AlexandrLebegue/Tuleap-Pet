import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TuleapClient } from '../../../src/main/tuleap'

/**
 * Charge les variables TULEAP_* depuis `.tuleap-test.env` à la racine du repo
 * s'il existe (cas d'un run local après `scripts/tuleap-bootstrap.sh`).
 * En CI le bootstrap écrit dans $GITHUB_ENV et les variables sont déjà dans
 * process.env, ce loader devient un no-op.
 */
function loadEnvFile(): void {
  const envPath = resolve(process.cwd(), '.tuleap-test.env')
  if (!existsSync(envPath)) return
  const text = readFileSync(envPath, 'utf-8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

loadEnvFile()

export type IntegrationEnv = {
  baseUrl: string
  token: string
  projectId: number
  trackerId: number
}

function readRequired(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(
      `[integration] variable d'environnement ${key} manquante — lance d'abord scripts/tuleap-bootstrap.sh`
    )
  }
  return value
}

export function getIntegrationEnv(): IntegrationEnv {
  return {
    baseUrl: readRequired('TULEAP_URL'),
    token: readRequired('TULEAP_TOKEN'),
    projectId: Number.parseInt(readRequired('TULEAP_PROJECT_ID'), 10),
    trackerId: Number.parseInt(readRequired('TULEAP_TRACKER_ID'), 10)
  }
}

let cachedClient: TuleapClient | null = null

export function getIntegrationClient(): TuleapClient {
  if (cachedClient) return cachedClient
  const env = getIntegrationEnv()
  cachedClient = new TuleapClient({ baseUrl: env.baseUrl, token: env.token })
  return cachedClient
}
