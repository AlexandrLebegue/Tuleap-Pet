import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import {
  findCompileScripts,
  findNearestScript
} from '../../src/main/warning-corrector/compile-runner'
import { resolveScriptsForSelection } from '../../src/main/warning-corrector/warning-corrector'

let root: string

beforeAll(() => {
  // repo/
  //   ai_compil.sh                (root)
  //   moduleA/ai_compil.sh        (nested)
  //   moduleA/src/a.cpp
  //   moduleB/src/b.cpp           (no nested script)
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-scripts-'))
  fs.writeFileSync(path.join(root, 'ai_compil.sh'), '#!/bin/sh\n')
  fs.mkdirSync(path.join(root, 'moduleA', 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'moduleA', 'ai_compil.sh'), '#!/bin/sh\n')
  fs.writeFileSync(path.join(root, 'moduleA', 'src', 'a.cpp'), 'int a(){return 0;}\n')
  fs.mkdirSync(path.join(root, 'moduleB', 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'moduleB', 'src', 'b.cpp'), 'int b(){return 0;}\n')
})

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('findCompileScripts', () => {
  it('finds every script, shallowest first', () => {
    const scripts = findCompileScripts(root)
    expect(scripts).toHaveLength(2)
    expect(scripts[0]).toBe(path.join(root, 'ai_compil.sh'))
    expect(scripts[1]).toBe(path.join(root, 'moduleA', 'ai_compil.sh'))
  })
})

describe('findNearestScript', () => {
  it('picks the deepest ancestor script for a nested file', () => {
    const scripts = findCompileScripts(root)
    const fileA = path.join(root, 'moduleA', 'src', 'a.cpp')
    expect(findNearestScript(fileA, scripts)).toBe(path.join(root, 'moduleA', 'ai_compil.sh'))
  })

  it('falls back to the root script for files outside every nested module', () => {
    const scripts = findCompileScripts(root)
    const fileB = path.join(root, 'moduleB', 'src', 'b.cpp')
    expect(findNearestScript(fileB, scripts)).toBe(path.join(root, 'ai_compil.sh'))
  })
})

describe('resolveScriptsForSelection', () => {
  it('runs the nearest script per selected file, deduplicated', () => {
    const chosen = resolveScriptsForSelection(root, [
      { sourceFile: 'moduleA/src/a.cpp', functions: ['a'] },
      { sourceFile: 'moduleB/src/b.cpp', functions: ['b'] }
    ])
    expect(new Set(chosen)).toEqual(
      new Set([path.join(root, 'moduleA', 'ai_compil.sh'), path.join(root, 'ai_compil.sh')])
    )
  })

  it('throws when no script exists', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-empty-'))
    expect(() => resolveScriptsForSelection(empty, [])).toThrow(/Aucun script/)
    fs.rmSync(empty, { recursive: true, force: true })
  })
})
