import { describe, expect, it } from 'vitest'
import {
  buildMessageWithAttachments,
  splitMessageContent,
  MAX_TOTAL_ATTACHMENT_CHARS
} from '../src/shared/chat-attachments'
import type { ChatAttachment } from '../src/shared/types'

function att(name: string, text: string): ChatAttachment {
  return { name, text, sizeBytes: text.length, truncated: false, kind: 'text' }
}

describe('buildMessageWithAttachments', () => {
  it('returns the question unchanged without attachments', () => {
    expect(buildMessageWithAttachments('Bonjour', [])).toBe('Bonjour')
  })

  it('wraps each document in start/end markers after the question', () => {
    const content = buildMessageWithAttachments('Résume ce doc', [att('spec.md', '# Titre\ncontenu')])
    expect(content).toContain('Résume ce doc')
    expect(content).toContain('--- Document joint : spec.md ---')
    expect(content).toContain('# Titre\ncontenu')
    expect(content).toContain('--- Fin du document : spec.md ---')
  })

  it('enforces the global character budget across attachments', () => {
    const big = 'x'.repeat(MAX_TOTAL_ATTACHMENT_CHARS)
    const content = buildMessageWithAttachments('Q', [att('a.txt', big), att('b.txt', 'should be cut')])
    expect(content).toContain('[… tronqué]')
    expect(content.length).toBeLessThan(MAX_TOTAL_ATTACHMENT_CHARS + 500)
  })
})

describe('splitMessageContent', () => {
  it('round-trips question and attachments', () => {
    const content = buildMessageWithAttachments('Analyse ces fichiers', [
      att('main.c', '#include <stdio.h>\nint main(void) { return 0; }'),
      att('notes.txt', 'ligne 1\nligne 2')
    ])
    const parsed = splitMessageContent(content)
    expect(parsed.text).toBe('Analyse ces fichiers')
    expect(parsed.attachments).toHaveLength(2)
    expect(parsed.attachments[0]).toEqual({
      name: 'main.c',
      text: '#include <stdio.h>\nint main(void) { return 0; }'
    })
    expect(parsed.attachments[1]!.name).toBe('notes.txt')
  })

  it('leaves plain messages untouched', () => {
    const parsed = splitMessageContent('Une simple question ?')
    expect(parsed.text).toBe('Une simple question ?')
    expect(parsed.attachments).toEqual([])
  })

  it('handles file names with regex special characters', () => {
    const content = buildMessageWithAttachments('Q', [att('rapport (v2)+final.pdf', 'contenu')])
    const parsed = splitMessageContent(content)
    expect(parsed.attachments).toHaveLength(1)
    expect(parsed.attachments[0]!.name).toBe('rapport (v2)+final.pdf')
  })
})
