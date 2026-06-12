import { dialog, type BrowserWindow } from 'electron'
import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import mammoth from 'mammoth'
import pdfParse from 'pdf-parse'
import { debugLog, debugWarn } from '../logger'
import type { ChatAttachment } from '@shared/types'

const MAX_FILE_BYTES = 25 * 1024 * 1024
/** Per-file extracted text cap (~15k tokens) — the global budget across
 * attachments is enforced later by buildMessageWithAttachments. */
const MAX_CHARS_PER_FILE = 60_000

/** Binary formats we knowingly cannot extract — give a targeted message. */
const KNOWN_BINARY = new Set([
  '.doc', '.odt', '.xls', '.xlsx', '.ods', '.ppt', '.pptx', '.odp',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico',
  '.zip', '.tar', '.gz', '.7z', '.rar', '.exe', '.dll', '.so', '.bin'
])

function looksBinary(buffer: Buffer): boolean {
  const probe = buffer.subarray(0, 8192)
  if (probe.includes(0)) return true
  const text = probe.toString('utf8')
  let bad = 0
  for (const ch of text) if (ch === '�') bad++
  return text.length > 0 && bad / text.length > 0.1
}

function cap(text: string): { text: string; truncated: boolean } {
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (clean.length <= MAX_CHARS_PER_FILE) return { text: clean, truncated: false }
  return { text: clean.slice(0, MAX_CHARS_PER_FILE), truncated: true }
}

/** Extracts plain text from one file. Throws with a user-facing French
 * message when the format cannot be handled. */
export async function extractAttachment(filePath: string): Promise<ChatAttachment> {
  const name = basename(filePath)
  const ext = extname(filePath).toLowerCase()
  const buffer = await readFile(filePath)
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error(`${name} : fichier trop volumineux (max 25 Mo).`)
  }

  if (ext === '.pdf') {
    const parsed = await pdfParse(buffer)
    const { text, truncated } = cap(parsed.text)
    if (!text) throw new Error(`${name} : aucun texte extractible (PDF scanné/image ?).`)
    return { name, text, sizeBytes: buffer.length, truncated, kind: 'pdf' }
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer })
    const { text, truncated } = cap(result.value)
    if (!text) throw new Error(`${name} : aucun texte extractible du document Word.`)
    return { name, text, sizeBytes: buffer.length, truncated, kind: 'docx' }
  }

  if (KNOWN_BINARY.has(ext)) {
    throw new Error(
      `${name} : format non supporté — convertissez en .pdf, .docx ou fichier texte.`
    )
  }

  // Everything else (code, markdown, logs, CSV, JSON…) is treated as text.
  if (looksBinary(buffer)) {
    throw new Error(`${name} : fichier binaire non supporté.`)
  }
  const { text, truncated } = cap(buffer.toString('utf8'))
  if (!text) throw new Error(`${name} : fichier vide.`)
  return { name, text, sizeBytes: buffer.length, truncated, kind: 'text' }
}

/** Opens the file picker and extracts every selected file. Per-file
 * failures are reported in `errors` without blocking the others. */
export async function pickAttachments(
  win: BrowserWindow | null
): Promise<{ attachments: ChatAttachment[]; errors: string[] }> {
  const options: Electron.OpenDialogOptions = {
    title: 'Joindre des documents',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Documents et code', extensions: ['*'] },
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'Word', extensions: ['docx'] }
    ]
  }
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) {
    return { attachments: [], errors: [] }
  }

  const attachments: ChatAttachment[] = []
  const errors: string[] = []
  for (const filePath of result.filePaths) {
    try {
      const att = await extractAttachment(filePath)
      debugLog('[chat] attachment %s: %d chars (kind=%s, truncated=%s)',
        att.name, att.text.length, att.kind, att.truncated)
      attachments.push(att)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      debugWarn('[chat] attachment failed: %s', message)
      errors.push(message)
    }
  }
  return { attachments, errors }
}
