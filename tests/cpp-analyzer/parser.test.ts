import { describe, expect, it } from 'vitest'
import { parseFile, stripCommentsAndStrings, extractIncludes } from '../../src/main/cpp-analyzer/parser'

describe('stripCommentsAndStrings', () => {
  it('removes line comments but preserves newlines', () => {
    const input = 'int x; // a comment\nint y;'
    const out = stripCommentsAndStrings(input)
    expect(out.length).toBe(input.length)
    expect(out).not.toContain('comment')
    expect(out.split('\n').length).toBe(2)
  })

  it('removes block comments preserving line count', () => {
    const input = 'int x;\n/* multi\nline\ncomment */\nint y;'
    const out = stripCommentsAndStrings(input)
    expect(out.split('\n').length).toBe(5)
    expect(out).not.toContain('multi')
  })

  it('blanks out string literal contents but keeps quotes', () => {
    const out = stripCommentsAndStrings('const char* s = "hello {world}";')
    expect(out).not.toContain('hello')
    expect(out).not.toContain('{')
    expect(out.match(/"/g)?.length).toBe(2)
  })
})

describe('extractIncludes', () => {
  it('captures quoted and angle-bracket includes', () => {
    const src = '#include "foo.h"\n#include <vector>\n#include  "bar/baz.hpp"\nint x;'
    expect(extractIncludes(src)).toEqual(['foo.h', 'vector', 'bar/baz.hpp'])
  })
})

describe('parseFile', () => {
  it('extracts free functions in a namespace', () => {
    const src = `
#include "x.h"
namespace calc {

int add(int a, int b) {
  return a + b;
}

int multiply(int a, int b) { return a * b; }

}
`
    const defs = parseFile('/abs/calculator.cpp', src)
    const names = defs.map((d) => d.qualifiedName).sort()
    expect(names).toEqual(['calc::add', 'calc::multiply'])
    const add = defs.find((d) => d.name === 'add')!
    expect(add.namespacePath).toBe('calc')
    expect(add.className).toBe('')
    expect(add.body).toContain('return a + b;')
    expect(add.isHeader).toBe(false)
    expect(add.hasBody).toBe(true)
  })

  it('records 1-based start/end lines aligned to the signature', () => {
    const src = ['int foo(int x) {', '  return x;', '}', ''].join('\n')
    const [foo] = parseFile('/abs/x.cpp', src)
    expect(foo).toBeDefined()
    expect(foo!.startLine).toBe(1)
    expect(foo!.endLine).toBe(3)
  })

  it('ignores `if`, `for`, control-flow blocks', () => {
    const src = `
int foo(int x) {
  if (x > 0) {
    for (int i = 0; i < 3; ++i) {
      x += i;
    }
  }
  return x;
}
`
    const defs = parseFile('/abs/x.cpp', src)
    expect(defs.map((d) => d.name)).toEqual(['foo'])
  })

  it('skips forward declarations (no body)', () => {
    const src = `
int declared_only(int x);
int defined(int x) { return x; }
`
    const defs = parseFile('/abs/x.cpp', src)
    expect(defs.map((d) => d.name)).toEqual(['defined'])
  })

  it('marks header files with isHeader=true', () => {
    const src = 'inline int add(int a, int b) { return a + b; }'
    const [fn] = parseFile('/abs/calc.h', src)
    expect(fn?.isHeader).toBe(true)
  })

  it('handles nested namespaces in the qualified name', () => {
    const src = `
namespace a {
namespace b {
int f() { return 1; }
}
}
`
    const [fn] = parseFile('/abs/x.cpp', src)
    expect(fn?.qualifiedName).toBe('a::b::f')
    expect(fn?.namespacePath).toBe('a::b')
  })

  it('attributes out-of-class definitions to their class', () => {
    const src = `
namespace ns {
int Foo::method(int x) { return x + 1; }
}
`
    const [fn] = parseFile('/abs/x.cpp', src)
    expect(fn?.name).toBe('method')
    expect(fn?.className).toBe('Foo')
    expect(fn?.qualifiedName).toBe('ns::Foo::method')
  })

  it('ignores preprocessor directives that look function-like', () => {
    const src = `
#define MIN(a, b) ((a) < (b) ? (a) : (b))
int real(int x) { return MIN(x, 0); }
`
    const defs = parseFile('/abs/x.cpp', src)
    expect(defs.map((d) => d.name)).toEqual(['real'])
  })
})
