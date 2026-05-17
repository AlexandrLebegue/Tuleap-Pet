import { describe, expect, it } from 'vitest'
import { extractCallees, extractCallSites } from '../../src/main/cpp-analyzer/callExtractor'

describe('extractCallees', () => {
  it('captures simple call names inside a body', () => {
    const body = `int square(int x) {
  return multiply(x, x);
}`
    expect(extractCallees(body)).toEqual(['multiply'])
  })

  it('keeps last segment of qualified call expressions', () => {
    const body = `void f() {
  ns::sub::compute(1, 2);
}`
    expect(extractCallees(body)).toEqual(['compute'])
  })

  it('ignores control-flow keywords', () => {
    const body = `int f(int x) {
  if (x > 0) { return x; }
  while (x < 10) { x++; }
  for (int i = 0; i < 3; ++i) {}
  switch (x) { case 1: break; }
  return sizeof(int);
}`
    expect(extractCallees(body)).toEqual([])
  })

  it('reports line numbers relative to the body start', () => {
    const body = `int f() {
  a();
  b();
  return c();
}`
    const sites = extractCallSites(body)
    expect(sites).toEqual([
      { name: 'a', line: 2 },
      { name: 'b', line: 3 },
      { name: 'c', line: 4 }
    ])
  })

  it('captures method calls via dot/arrow (matched on the method name)', () => {
    const body = `void f(Obj& o, Obj* p) {
  o.method_a();
  p->method_b();
}`
    expect(extractCallees(body).sort()).toEqual(['method_a', 'method_b'])
  })
})
