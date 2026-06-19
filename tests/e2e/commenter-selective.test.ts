import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { makeMockProvider, rmTemp, setMockHandler } from './_helpers'

vi.mock('../../src/main/llm', () => ({
  resolveLlmProvider: () => makeMockProvider()
}))

import {
  runSelectiveCommenter,
  findHeaderDeclLine
} from '../../src/main/commenter/selective-commenter'
import type { CommentTarget } from '../../src/shared/types'

const BRIEF = `\
\`\`\`cpp
/*----------------------------------------------------------------------------*/
/*! \\brief Adds two integers.
 *
 * \\param [in] a : first operand
 * \\param [in] b : second operand
 * \\return the sum
 *
 * \\remark Néant
 */
/*----------------------------------------------------------------------------*/
\`\`\`
`

const COMMENTED_BODY = `\
\`\`\`cpp
int add(int a, int b)
{
    /*! \\brief Définition des variables */
    return a + b;
}
\`\`\`
`

describe('Selective commenter (C: brief in .h, body comments in .c)', () => {
  let root: string

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuleap-pet-sel-'))
    fs.writeFileSync(
      path.join(root, 'math.h'),
      ['#ifndef MATH_H', '#define MATH_H', '', 'int add(int a, int b);', '', '#endif', ''].join(
        '\n'
      ),
      'utf8'
    )
    fs.writeFileSync(
      path.join(root, 'math.c'),
      ['#include "math.h"', '', 'int add(int a, int b)', '{', '    return a + b;', '}', ''].join(
        '\n'
      ),
      'utf8'
    )
  })
  afterAll(() => rmTemp(root))

  it('findHeaderDeclLine locates the prototype, not a definition', () => {
    const header = fs.readFileSync(path.join(root, 'math.h'), 'utf8')
    expect(findHeaderDeclLine(header, 'add')).toBe(4)
    expect(findHeaderDeclLine(header, 'missing')).toBeNull()
  })

  it('writes the brief above the declaration in the .h and comments the body in the .c', async () => {
    setMockHandler((req) => {
      const sys = req.messages.find((m) => m.role === 'system')?.content ?? ''
      // The inline-body prompt is in French ("documentation inline").
      return sys.toLowerCase().includes('inline') ? COMMENTED_BODY : BRIEF
    })

    const targets: CommentTarget[] = [
      { headerPath: 'math.h', name: 'add', implFile: 'math.c', implLine: 3, inHeader: false }
    ]

    const result = await runSelectiveCommenter(root, targets, {
      commentHeader: true,
      commentBody: true,
      depth: 2
    })

    expect(result.commented).toBe(1)
    expect(result.failed).toBe(0)

    const header = fs.readFileSync(path.join(root, 'math.h'), 'utf8')
    const source = fs.readFileSync(path.join(root, 'math.c'), 'utf8')

    // Brief landed in the header, above the (preserved) declaration.
    expect(header).toContain('\\brief Adds two integers.')
    expect(header.indexOf('\\brief Adds two integers.')).toBeLessThan(
      header.indexOf('int add(int a, int b);')
    )
    // Body comments landed in the .c; signature/logic preserved.
    expect(source).toContain('Définition des variables')
    expect(source).toContain('return a + b;')
    // The header brief must NOT leak into the .c.
    expect(source).not.toContain('Adds two integers.')
  })

  it('only comments the header when commentBody is off', async () => {
    // Reset files.
    fs.writeFileSync(
      path.join(root, 'math.h'),
      ['#ifndef MATH_H', '#define MATH_H', '', 'int add(int a, int b);', '', '#endif', ''].join(
        '\n'
      ),
      'utf8'
    )
    fs.writeFileSync(
      path.join(root, 'math.c'),
      ['#include "math.h"', '', 'int add(int a, int b)', '{', '    return a + b;', '}', ''].join(
        '\n'
      ),
      'utf8'
    )
    setMockHandler(() => BRIEF)

    const targets: CommentTarget[] = [
      { headerPath: 'math.h', name: 'add', implFile: 'math.c', implLine: 3, inHeader: false }
    ]
    const before = fs.readFileSync(path.join(root, 'math.c'), 'utf8')
    const result = await runSelectiveCommenter(root, targets, {
      commentHeader: true,
      commentBody: false
    })

    expect(result.commented).toBe(1)
    expect(fs.readFileSync(path.join(root, 'math.h'), 'utf8')).toContain(
      '\\brief Adds two integers.'
    )
    // .c is untouched.
    expect(fs.readFileSync(path.join(root, 'math.c'), 'utf8')).toBe(before)
  })
})
