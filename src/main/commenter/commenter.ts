import { resolveLlmProvider } from '../llm'
import { getCommenterSystemPrompt, buildUserPrompt, isSupported } from '../prompts/commenter-prompts'
import type { CommentingOptions } from '../prompts/commenter-prompts'

export type { CommentingOptions }

export type CommenterFile = { name: string; content: string }
export type CommenterResult = { results: CommenterFile[]; errors: { name: string; error: string }[] }

function decodeBuffer(buffer: Buffer): string {
  const encodings = ['utf8', 'latin1', 'utf16le'] as const
  for (const enc of encodings) {
    try {
      const decoded = buffer.toString(enc)
      if (decoded.trim()) return decoded
    } catch {
      continue
    }
  }
  return buffer.toString('utf8', 0, buffer.length)
}

function isEmptyOrWhitespace(content: string): boolean {
  if (!content) return true
  const stripped = content.trim()
  if (!stripped) return true
  const nonEmpty = stripped
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !(l.startsWith('/*') && l.endsWith('*/')))
  return nonEmpty.length === 0
}

export async function processSingleFile(
  content: string,
  filename: string,
  options: CommentingOptions
): Promise<string> {
  if (!isSupported(filename)) {
    throw new Error(`Extension non supportée: ${filename}`)
  }
  if (isEmptyOrWhitespace(content)) {
    throw new Error(`Fichier vide: ${filename}`)
  }

  const provider = resolveLlmProvider()
  const systemPrompt = getCommenterSystemPrompt()
  const userPrompt = buildUserPrompt(filename, content, options)

  const result = await provider.generate({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.1,
    maxOutputTokens: 8192
  })

  return result.text
}

export async function processMultipleFiles(
  files: CommenterFile[],
  options: CommentingOptions,
  onProgress?: (index: number, total: number, filename: string) => void
): Promise<CommenterResult> {
  const results: CommenterFile[] = []
  const errors: { name: string; error: string }[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (!file) continue
    const { name, content } = file
    onProgress?.(i, files.length, name)

    if (!isSupported(name)) {
      errors.push({ name, error: 'Extension non supportée' })
      continue
    }
    if (isEmptyOrWhitespace(content)) {
      errors.push({ name, error: 'Fichier vide ou sans code' })
      continue
    }

    try {
      const commented = await processSingleFile(content, name, options)
      results.push({ name, content: commented })
    } catch (err) {
      errors.push({ name, error: err instanceof Error ? err.message : String(err) })
    }
  }

  onProgress?.(files.length, files.length, 'Terminé')
  return { results, errors }
}

export { isSupported, decodeBuffer }
