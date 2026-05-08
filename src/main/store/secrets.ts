import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

/**
 * Stockage chiffré pour les secrets : token Tuleap et clé API OpenRouter.
 * Les buffers chiffrés sont écrits sur disque sous <userData>/secrets/.
 * Les valeurs déchiffrées ne quittent JAMAIS le main process.
 */

const TULEAP_TOKEN_FILE = 'tuleap-token.bin'
const OPENROUTER_KEY_FILE = 'openrouter-key.bin'
const LOCAL_LLM_KEY_FILE = 'local-llm-key.bin'
const OAUTH_TOKEN_FILE = 'tuleap-oauth.bin'

function secretPath(file: string): string {
  return join(app.getPath('userData'), 'secrets', file)
}

export function isSecretStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

function writeSecret(file: string, plain: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "Le coffre du système d'exploitation n'est pas disponible. Le secret ne peut pas être chiffré."
    )
  }
  const trimmed = plain.trim()
  if (!trimmed) {
    throw new Error('Le secret est vide.')
  }
  const encrypted = safeStorage.encryptString(trimmed)
  const target = secretPath(file)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, encrypted, { mode: 0o600 })
}

function readSecret(file: string): string | null {
  const target = secretPath(file)
  if (!existsSync(target)) return null
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(readFileSync(target))
  } catch {
    return null
  }
}

function deleteSecret(file: string): void {
  const target = secretPath(file)
  if (existsSync(target)) unlinkSync(target)
}

// ---- Tuleap token ----------------------------------------------------

export function setTuleapToken(plain: string): void {
  writeSecret(TULEAP_TOKEN_FILE, plain)
}

export function getTuleapToken(): string | null {
  return readSecret(TULEAP_TOKEN_FILE)
}

export function hasTuleapToken(): boolean {
  return existsSync(secretPath(TULEAP_TOKEN_FILE))
}

export function clearTuleapToken(): void {
  deleteSecret(TULEAP_TOKEN_FILE)
}

// ---- OpenRouter API key ---------------------------------------------

export function setOpenRouterKey(plain: string): void {
  writeSecret(OPENROUTER_KEY_FILE, plain)
}

/**
 * Returns the API key, preferring the OPENROUTER_API_KEY env var when set
 * (useful in CI or for local dev) over the encrypted on-disk value.
 */
export function getOpenRouterKey(): string | null {
  const env = process.env['OPENROUTER_API_KEY']
  if (env && env.trim().length > 0) return env.trim()
  return readSecret(OPENROUTER_KEY_FILE)
}

export function hasOpenRouterKey(): boolean {
  const env = process.env['OPENROUTER_API_KEY']
  if (env && env.trim().length > 0) return true
  return existsSync(secretPath(OPENROUTER_KEY_FILE))
}

export function isOpenRouterKeyFromEnv(): boolean {
  const env = process.env['OPENROUTER_API_KEY']
  return Boolean(env && env.trim().length > 0)
}

export function clearOpenRouterKey(): void {
  deleteSecret(OPENROUTER_KEY_FILE)
}

// ---- Local LLM API key (optional, for endpoints that require auth) --------

export function setLocalLlmKey(plain: string): void {
  writeSecret(LOCAL_LLM_KEY_FILE, plain)
}

export function getLocalLlmKey(): string | null {
  const env = process.env['LOCAL_LLM_API_KEY']
  if (env && env.trim().length > 0) return env.trim()
  return readSecret(LOCAL_LLM_KEY_FILE)
}

export function hasLocalLlmKey(): boolean {
  const env = process.env['LOCAL_LLM_API_KEY']
  if (env && env.trim().length > 0) return true
  return existsSync(secretPath(LOCAL_LLM_KEY_FILE))
}

export function isLocalLlmKeyFromEnv(): boolean {
  const env = process.env['LOCAL_LLM_API_KEY']
  return Boolean(env && env.trim().length > 0)
}

export function clearLocalLlmKey(): void {
  deleteSecret(LOCAL_LLM_KEY_FILE)
}

// ---- Tuleap OAuth2 tokens -------------------------------------------

export type OAuthTokenBundle = {
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
  scope: string | null
  obtainedAt: number
}

export function setOAuthBundle(bundle: OAuthTokenBundle): void {
  writeSecret(OAUTH_TOKEN_FILE, JSON.stringify(bundle))
}

export function getOAuthBundle(): OAuthTokenBundle | null {
  const raw = readSecret(OAUTH_TOKEN_FILE)
  if (!raw) return null
  try {
    return JSON.parse(raw) as OAuthTokenBundle
  } catch {
    return null
  }
}

export function hasOAuthBundle(): boolean {
  return existsSync(secretPath(OAUTH_TOKEN_FILE))
}

export function clearOAuthBundle(): void {
  deleteSecret(OAUTH_TOKEN_FILE)
}
