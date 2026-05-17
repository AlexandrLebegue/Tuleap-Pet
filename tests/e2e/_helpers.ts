import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {
  LlmGenerateRequest,
  LlmGenerateResult,
  LlmProvider,
  LlmStreamChunk
} from '../../src/main/llm/types'

export type MockHandler = (req: LlmGenerateRequest) => string

class MockProvider implements LlmProvider {
  readonly name = 'mock'
  constructor(private readonly getHandler: () => MockHandler) {}
  async generate(req: LlmGenerateRequest): Promise<LlmGenerateResult> {
    return {
      text: this.getHandler()(req),
      model: 'mock',
      finishReason: 'stop',
      usage: null
    }
  }
  async stream(
    req: LlmGenerateRequest,
    onChunk: (chunk: LlmStreamChunk) => void
  ): Promise<LlmGenerateResult> {
    const text = this.getHandler()(req)
    onChunk({ type: 'text', delta: text })
    onChunk({ type: 'finish', finishReason: 'stop', usage: null })
    return { text, model: 'mock', finishReason: 'stop', usage: null }
  }
}

let _handler: MockHandler = () => ''

export function setMockHandler(h: MockHandler): void {
  _handler = h
}

export function makeMockProvider(): LlmProvider {
  return new MockProvider(() => _handler)
}

/** Recursively copy a directory tree to `dest`. */
export function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const sp = path.join(src, entry.name)
    const dp = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'build' || entry.name === '_deps' || entry.name === 'CMakeFiles') continue
      copyDir(sp, dp)
    } else if (entry.isFile()) {
      fs.copyFileSync(sp, dp)
    }
  }
}

export function mkTempProjectFromSample(sampleSubpath: string): string {
  const repoRoot = path.resolve(__dirname, '../..')
  const src = path.join(repoRoot, sampleSubpath)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tuleap-pet-e2e-'))
  copyDir(src, tmp)
  return tmp
}

export function rmTemp(p: string): void {
  try {
    fs.rmSync(p, { recursive: true, force: true })
  } catch {
    // ignore
  }
}
