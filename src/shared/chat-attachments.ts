/**
 * Format des pièces jointes dans le contenu d'un message utilisateur.
 * Partagé entre le main process (construction du message envoyé au LLM et
 * persisté en base) et le renderer (repli des documents dans la bulle).
 */
import type { ChatAttachment } from './types'

/** Total extracted characters allowed across all attachments of one message. */
export const MAX_TOTAL_ATTACHMENT_CHARS = 150_000

function startMarker(name: string): string {
  return `--- Document joint : ${name} ---`
}

function endMarker(name: string): string {
  return `--- Fin du document : ${name} ---`
}

/**
 * Builds the full user-message content: the question first, then each
 * document wrapped in explicit markers the model can reference and the UI
 * can collapse. Enforces the global character budget across attachments.
 */
export function buildMessageWithAttachments(
  question: string,
  attachments: ChatAttachment[]
): string {
  if (attachments.length === 0) return question
  let budget = MAX_TOTAL_ATTACHMENT_CHARS
  const blocks: string[] = []
  for (const att of attachments) {
    const text = att.text.length > budget ? att.text.slice(0, budget) + '\n[… tronqué]' : att.text
    budget = Math.max(0, budget - text.length)
    blocks.push(`${startMarker(att.name)}\n${text}\n${endMarker(att.name)}`)
  }
  return `${question}\n\n${blocks.join('\n\n')}`
}

const ATTACHMENT_BLOCK_RE =
  /\n?--- Document joint : (.*?) ---\n([\s\S]*?)\n--- Fin du document : \1 ---/g

/**
 * Splits a persisted user message back into the visible question and its
 * attached documents (for collapsed rendering in the chat bubble).
 */
export function splitMessageContent(content: string): {
  text: string
  attachments: Array<{ name: string; text: string }>
} {
  const attachments: Array<{ name: string; text: string }> = []
  const text = content
    .replace(ATTACHMENT_BLOCK_RE, (_match, name: string, docText: string) => {
      attachments.push({ name, text: docText })
      return ''
    })
    .trim()
  return { text, attachments }
}
