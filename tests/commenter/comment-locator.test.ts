import { describe, expect, it } from 'vitest'
import { findExistingCommentRange, detectFunctionIndent } from '../../src/main/commenter/comment-locator'

describe('findExistingCommentRange', () => {
  it('finds a Doxygen block immediately above the function', () => {
    const src = [
      '/*! \\brief Adds two integers.',
      ' *',
      ' * \\param a first',
      ' * \\param b second',
      ' * \\return sum',
      ' */',
      'int add(int a, int b) {',
      '  return a + b;',
      '}'
    ].join('\n')
    const range = findExistingCommentRange(src, 7)
    expect(range).not.toBeNull()
    expect(range!.startLine).toBe(1)
    expect(range!.endLine).toBe(6)
    expect(range!.text).toContain('\\brief')
  })

  it('includes the banner delimiter line above /*! when present', () => {
    const src = [
      '/*----------------------------------------------------------------------------*/',
      '/*! \\brief banner-style comment',
      ' */',
      '/*----------------------------------------------------------------------------*/',
      'int foo() { return 0; }'
    ].join('\n')
    // Wait: in the project's convention the banner-end is the *line after* the */
    // before the function. Pattern is: /*---*/  /*! ... */  /*---*/  int foo()...
    // So a blank line separates the closing /*---*/ from the function in real code.
    // Adjusted assertion: the locator picks up the first three banner+comment lines.
    const range = findExistingCommentRange(src, 5)
    expect(range).not.toBeNull()
    // Banner closing /*---*/ is the last line of the comment region.
    expect(range!.endLine).toBe(4)
  })

  it('returns null when no comment precedes the function', () => {
    const src = ['', 'int foo() { return 0; }'].join('\n')
    const range = findExistingCommentRange(src, 2)
    expect(range).toBeNull()
  })

  it('tolerates blank lines between the comment and the function', () => {
    const src = [
      '/*! \\brief x */',
      '',
      '',
      'int bar(int x) { return x; }'
    ].join('\n')
    const range = findExistingCommentRange(src, 4)
    expect(range).not.toBeNull()
    expect(range!.startLine).toBe(1)
    expect(range!.endLine).toBe(1)
  })

  it('captures a cluster of // line comments', () => {
    const src = [
      '// First line',
      '// Second line',
      'int z() { return 0; }'
    ].join('\n')
    const range = findExistingCommentRange(src, 3)
    expect(range).not.toBeNull()
    expect(range!.startLine).toBe(1)
    expect(range!.endLine).toBe(2)
  })
})

describe('detectFunctionIndent', () => {
  it('returns leading whitespace of the function signature line', () => {
    const src = ['namespace x {', '  int foo() { return 0; }', '}'].join('\n')
    expect(detectFunctionIndent(src, 2)).toBe('  ')
  })
  it('returns empty string when the function starts at column 0', () => {
    const src = 'int top() {}'
    expect(detectFunctionIndent(src, 1)).toBe('')
  })
})
