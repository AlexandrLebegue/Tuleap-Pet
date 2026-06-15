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
import type { LlmToolEvent } from '../src/main/llm/types'

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
const SKIP_DIAGNOSTIC = !API_KEY

const provider = createOpenRouterProvider({
  apiKey: API_KEY || 'sk-diagnostic-placeholder',
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

describe.skipIf(SKIP_DIAGNOSTIC)('Diagnostic: Chat tool-calling with OpenRouter', () => {
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

  it('runTools() — agentic tool round-trip (same as chat IPC handler)', async () => {
    const tools = buildDummyTools()
    const toolEvents: LlmToolEvent[] = []
    let streamed = ''

    // This replicates the exact pattern from src/main/ipc/chat.ts handler.
    const result = await provider.runTools(
      {
        messages: [SYSTEM_MSG, USER_MSG],
        tools,
        temperature: 0,
        maxOutputTokens: 512,
        maxSteps: 4
      },
      {
        onToolEvent: (ev) => {
          toolEvents.push(ev)
          if (ev.kind === 'call') {
            console.log('[runTools] tool-call:', ev.toolName, 'args:', JSON.stringify(ev.args))
          } else {
            console.log('[runTools] tool-result:', ev.toolName, 'result:', JSON.stringify(ev.result))
          }
        },
        onText: (delta) => {
          streamed += delta
          console.log('[runTools] text:', JSON.stringify(delta))
        }
      }
    )

    console.log('[runTools] final result.text:', result.text)

    // ─── Assertions ────────────────────────────────────────────────────

    // 1. At least one tool call targeting say_bonjour
    const calls = toolEvents.filter((e) => e.kind === 'call')
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls.some((e) => e.toolName === 'say_bonjour')).toBe(true)

    // 2. At least one tool result containing "Bonjour"
    const results = toolEvents.filter((e) => e.kind === 'result')
    expect(results.length).toBeGreaterThanOrEqual(1)
    const bonjour = results.find((e) => e.toolName === 'say_bonjour')
    expect(bonjour).toBeDefined()
    if (bonjour && bonjour.kind === 'result') {
      expect(JSON.stringify(bonjour.result).toLowerCase()).toContain('bonjour')
    }

    // 3. Final text is non-empty and contains "Bonjour"
    expect(result.text).toBeTruthy()
    expect(result.text.toLowerCase()).toContain('bonjour')
    expect(result.finishReason).toBeTruthy()
  }, TIMEOUT)

  it('runTools() — without tools (baseline sanity check)', async () => {
    const result = await provider.runTools({
      messages: [
        { role: 'system', content: 'Réponds très brièvement en français.' },
        { role: 'user', content: 'Dis bonjour.' }
      ],
      temperature: 0,
      maxOutputTokens: 100
    })

    console.log('[no-tools] result.text:', result.text)
    expect(result.text).toBeTruthy()
    expect(result.text.toLowerCase()).toContain('bonjour')
  }, TIMEOUT)
})
