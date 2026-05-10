/// <reference types="node" />
/**
 * Diagnostic test: Chat tool-calling via OpenRouter + Claude Haiku
 *
 * Purpose: Isolate whether the bug is in tool execution or in the chat
 * streaming loop. Uses a trivial dummy tool (say_bonjour) with zero
 * external dependencies so we can pinpoint failures.
 *
 * Run with:
 *   npx vitest run tests/chat-tool-diagnostic.test.ts
 */

import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { tool } from 'ai'
import { createOpenRouterProvider } from '../src/main/llm/openrouter'
import type { LlmStreamChunk } from '../src/main/llm/types'

// ─── Dummy Tool ──────────────────────────────────────────────────────────────

/**
 * A trivial tool that returns "Bonjour, {name} !" — no side effects, no I/O.
 * This mimics the structure of tools in src/main/llm/tools.ts but eliminates
 * all Tuleap/DB dependencies.
 */
function buildDummyTools() {
  return {
    say_bonjour: tool({
      description:
        'Dit bonjour à une personne. Retourne un message de salutation. Appelle TOUJOURS cet outil quand on te demande de saluer quelqu\'un.',
      inputSchema: z.object({
        name: z.string().describe('Le prénom de la personne à saluer')
      }),
      async execute(input): Promise<string> {
        const { name } = input as { name: string }
        console.log(`[dummy-tool] say_bonjour called with name="${name}"`)
        return `Bonjour, ${name} !`
      }
    })
  }
}

// ─── Provider Setup ──────────────────────────────────────────────────────────

// Load API key from environment variable to avoid committing secrets.
// Run: OPENROUTER_API_KEY=sk-or-... npx vitest run tests/chat-tool-diagnostic.test.ts
const API_KEY = process.env.OPENROUTER_API_KEY ?? ''
const MODEL = 'anthropic/claude-3.5-haiku'

const provider = createOpenRouterProvider({
  apiKey: API_KEY,
  defaultModel: MODEL,
  appName: 'Tuleap-Pet-Diagnostic'
})

// ─── Test Messages ───────────────────────────────────────────────────────────

const SYSTEM_MSG = {
  role: 'system' as const,
  content: `Tu es un assistant de test. Tu as un outil "say_bonjour" qui salue une personne.
Quand l'utilisateur te demande de saluer quelqu'un, tu DOIS appeler l'outil say_bonjour avec le prénom donné.
Après avoir reçu le résultat de l'outil, réponds à l'utilisateur en incluant le message retourné par l'outil.`
}

const USER_MSG = {
  role: 'user' as const,
  content: 'Salue Alexandre en utilisant l\'outil say_bonjour.'
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Diagnostic: Chat tool-calling with OpenRouter', () => {
  // Increase timeout since we're hitting a real API
  const TIMEOUT = 60_000

  it('generate() — non-streaming tool round-trip', async () => {
    const tools = buildDummyTools()

    const result = await provider.generate({
      messages: [SYSTEM_MSG, USER_MSG],
      tools,
      temperature: 0,
      maxOutputTokens: 512,
      maxSteps: 4
    })

    console.log('[generate] result.text:', result.text)
    console.log('[generate] finishReason:', result.finishReason)
    console.log('[generate] usage:', result.usage)

    // The model should have called say_bonjour and included the greeting
    expect(result.text).toBeTruthy()
    expect(result.text.toLowerCase()).toContain('bonjour')
    expect(result.finishReason).toBeTruthy()
  }, TIMEOUT)

  it('stream() — streaming tool round-trip (same as chat IPC handler)', async () => {
    const tools = buildDummyTools()
    const chunks: LlmStreamChunk[] = []

    // This replicates the exact pattern from src/main/ipc/chat.ts lines 196-248
    let buffered = ''
    const result = await provider.stream(
      {
        messages: [SYSTEM_MSG, USER_MSG],
        tools,
        temperature: 0,
        maxOutputTokens: 512,
        maxSteps: 4
      },
      (chunk) => {
        chunks.push(chunk)
        if (chunk.type === 'text') {
          buffered += chunk.delta
          console.log('[stream] text-delta:', JSON.stringify(chunk.delta))
        } else if (chunk.type === 'tool-call') {
          console.log('[stream] tool-call:', chunk.toolName, 'args:', JSON.stringify(chunk.args))
        } else if (chunk.type === 'tool-result') {
          console.log('[stream] tool-result:', chunk.toolName, 'result:', JSON.stringify(chunk.result))
        } else if (chunk.type === 'finish') {
          console.log('[stream] finish:', chunk.finishReason, 'usage:', chunk.usage)
        }
      }
    )

    console.log('[stream] final result.text:', result.text)
    console.log('[stream] buffered:', buffered)

    // ─── Assertions ────────────────────────────────────────────────────

    // 1. We should have received at least one tool-call chunk
    const toolCalls = chunks.filter((c) => c.type === 'tool-call')
    console.log(`[stream] total tool-call chunks: ${toolCalls.length}`)
    expect(toolCalls.length).toBeGreaterThanOrEqual(1)

    // 2. The tool-call should target say_bonjour
    const sayBonjourCall = toolCalls.find(
      (c) => c.type === 'tool-call' && c.toolName === 'say_bonjour'
    )
    expect(sayBonjourCall).toBeDefined()

    // 3. We should have received at least one tool-result chunk
    const toolResults = chunks.filter((c) => c.type === 'tool-result')
    console.log(`[stream] total tool-result chunks: ${toolResults.length}`)
    expect(toolResults.length).toBeGreaterThanOrEqual(1)

    // 4. The tool-result should contain "Bonjour"
    const bonjourResult = toolResults.find(
      (c) => c.type === 'tool-result' && c.toolName === 'say_bonjour'
    )
    expect(bonjourResult).toBeDefined()
    if (bonjourResult && bonjourResult.type === 'tool-result') {
      expect(JSON.stringify(bonjourResult.result).toLowerCase()).toContain('bonjour')
    }

    // 5. We should have a finish chunk
    const finishChunks = chunks.filter((c) => c.type === 'finish')
    expect(finishChunks.length).toBe(1)

    // 6. Final text should be non-empty and contain "Bonjour"
    expect(result.text).toBeTruthy()
    expect(result.text.toLowerCase()).toContain('bonjour')

    // 7. Diagnostic: does result.text match buffered? (multi-step issue detection)
    if (result.text !== buffered) {
      console.warn(
        '[stream] ⚠️  MISMATCH: result.text differs from buffered text.',
        `\n  result.text length: ${result.text.length}`,
        `\n  buffered length: ${buffered.length}`,
        `\n  Missing portion: "${result.text.slice(buffered.length)}"`
      )
    } else {
      console.log('[stream] ✅ result.text matches buffered (no missing deltas)')
    }
  }, TIMEOUT)

  it('stream() — without tools (baseline sanity check)', async () => {
    let buffered = ''
    const result = await provider.stream(
      {
        messages: [
          { role: 'system', content: 'Réponds très brièvement en français.' },
          { role: 'user', content: 'Dis bonjour.' }
        ],
        temperature: 0,
        maxOutputTokens: 100
      },
      (chunk) => {
        if (chunk.type === 'text') {
          buffered += chunk.delta
        }
      }
    )

    console.log('[no-tools] result.text:', result.text)
    expect(result.text).toBeTruthy()
    expect(result.text.toLowerCase()).toContain('bonjour')
  }, TIMEOUT)
})
