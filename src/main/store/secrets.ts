import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

/**
 * Stockage chiffré pour les secrets (token Tuleap).
 * Le buffer chiffré est écrit sur disque sous <userData>/secrets/tuleap-token.bin.
 * Le token déchiffré ne quitte JAMAIS le main process.
 */

const FILE_NAME = 'tuleap-token.bin'

function tokenPath(): string {
  return join(app.getPath('userData'), 'secrets', FILE_NAME)
}

export function isSecretStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function setTuleapToken(plain: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "Le coffre du système d'exploitation n'est pas disponible. Le token ne peut pas être chiffré."
    )
  }
  const trimmed = plain.trim()
  if (!trimmed) {
    throw new Error('Le token est vide.')
  }
  const encrypted = safeStorage.encryptString(trimmed)
  const target = tokenPath()
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, encrypted, { mode: 0o600 })
}

export function getTuleapToken(): string | null {
  const target = tokenPath()
  if (!existsSync(target)) return null
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    const buf = readFileSync(target)
    return safeStorage.decryptString(buf)
  } catch {
    return null
  }
}

export function hasTuleapToken(): boolean {
  return existsSync(tokenPath())
}

export function clearTuleapToken(): void {
  const target = tokenPath()
  if (existsSync(target)) {
    unlinkSync(target)
  }
}
