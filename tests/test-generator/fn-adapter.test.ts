import { describe, expect, it } from 'vitest'
import {
  functionDefToParsed,
  extractReturnType,
  extractParams,
  buildFileInfoFromDefs
} from '../../src/main/test-generator/fn-adapter'
import type { FunctionDef } from '../../src/main/cpp-analyzer/types'

describe('extractReturnType', () => {
  it('extracts simple return type', () => {
    expect(extractReturnType('int add(int a, int b)')).toBe('int')
  })

  it('extracts pointer return type', () => {
    expect(extractReturnType('char* get_name(int id)')).toBe('char*')
  })

  it('extracts void', () => {
    expect(extractReturnType('void init()')).toBe('void')
  })

  it('extracts unsigned int', () => {
    expect(extractReturnType('unsigned int count(int n)')).toBe('unsigned int')
  })

  it('returns void for signatures without a clear return type', () => {
    expect(extractReturnType('main()')).toBe('void')
  })
})

describe('extractParams', () => {
  it('extracts simple parameters', () => {
    expect(extractParams('int add(int a, int b)')).toEqual([
      { name: 'a', type: 'int' },
      { name: 'b', type: 'int' }
    ])
  })

  it('handles void', () => {
    expect(extractParams('void init(void)')).toEqual([])
  })

  it('handles empty parens', () => {
    expect(extractParams('void init()')).toEqual([])
  })

  it('handles pointer parameters', () => {
    const result = extractParams('int process(char *name, int *count)')
    expect(result).toHaveLength(2)
    expect(result[0]!.name).toBe('name')
    expect(result[1]!.name).toBe('count')
  })

  it('handles const qualifiers', () => {
    const result = extractParams('int sum(const int *arr, int n)')
    expect(result).toHaveLength(2)
    expect(result[0]!.name).toBe('arr')
    expect(result[1]!.name).toBe('n')
  })
})

describe('functionDefToParsed', () => {
  const makeDef = (overrides: Partial<FunctionDef> = {}): FunctionDef => ({
    name: 'add',
    qualifiedName: 'calc::add',
    signature: 'int add(int a, int b)',
    filePath: '/abs/calculator.c',
    startLine: 5,
    endLine: 7,
    body: 'int add(int a, int b) {\n  return a + b;\n}',
    namespacePath: 'calc',
    className: '',
    isHeader: false,
    hasBody: true,
    ...overrides
  })

  it('maps all fields correctly', () => {
    const parsed = functionDefToParsed(makeDef())
    expect(parsed.name).toBe('add')
    expect(parsed.signature).toBe('int add(int a, int b)')
    expect(parsed.returnType).toBe('int')
    expect(parsed.lineNumber).toBe(5)
    expect(parsed.sourceCode).toContain('return a + b')
    expect(parsed.parameters).toEqual([
      { name: 'a', type: 'int' },
      { name: 'b', type: 'int' }
    ])
  })

  it('uses qualifiedName in description when different from name', () => {
    const parsed = functionDefToParsed(makeDef())
    expect(parsed.description).toContain('calc::add')
  })
})

describe('buildFileInfoFromDefs', () => {
  it('builds correct FileInfo for a .c file', () => {
    const def: FunctionDef = {
      name: 'add',
      qualifiedName: 'add',
      signature: 'int add(int a, int b)',
      filePath: '/abs/calculator.c',
      startLine: 1,
      endLine: 3,
      body: 'int add(int a, int b) { return a + b; }',
      namespacePath: '',
      className: '',
      isHeader: false,
      hasBody: true
    }
    const info = buildFileInfoFromDefs([def], 'calculator.c')
    expect(info.name).toBe('calculator.c')
    expect(info.headerFile).toBe('calculator.h')
  })
})
