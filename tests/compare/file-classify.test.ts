import { describe, it, expect } from 'vitest'
import { classifyDiffPath, includeInSample, dirBucket } from '../../src/main/compare/file-classify'

describe('classifyDiffPath', () => {
  it('classifies source code files', () => {
    for (const p of ['src/foo.c', 'lib/bar.hpp', 'a/b/main.py', 'x.ts', 'mod.rs', 'app.vue']) {
      expect(classifyDiffPath(p)).toBe('source')
    }
  })

  it('classifies generated / vendored / build noise (the 16M-line case)', () => {
    for (const p of [
      'Visual/Caracterisation_Module.vcxproj.filters',
      'proj/App.vcxproj',
      'sol/Thing.sln',
      'node_modules/lib/index.js',
      'dist/bundle.js',
      'build/out.c',
      'third_party/dep/a.cpp',
      'package-lock.json',
      'yarn.lock',
      'app.min.js',
      'bundle.js.map'
    ]) {
      expect(classifyDiffPath(p)).toBe('generated')
    }
  })

  it('classifies tests before source', () => {
    for (const p of ['tests/test_foo.cpp', 'src/__tests__/x.ts', 'foo.test.ts', 'TestThing.java']) {
      expect(classifyDiffPath(p)).toBe('test')
    }
  })

  it('classifies config files', () => {
    for (const p of ['CMakeLists.txt', 'conf/app.yaml', 'settings.json', 'Makefile', 'a.cmake']) {
      expect(classifyDiffPath(p)).toBe('config')
    }
  })

  it('only source and test are sampled for the LLM', () => {
    expect(includeInSample('source')).toBe(true)
    expect(includeInSample('test')).toBe(true)
    expect(includeInSample('generated')).toBe(false)
    expect(includeInSample('config')).toBe(false)
    expect(includeInSample('other')).toBe(false)
  })

  it('handles windows separators', () => {
    expect(classifyDiffPath('3DPlus\\trunk\\Visual\\Mod.vcxproj.filters')).toBe('generated')
    expect(classifyDiffPath('3DPlus\\trunk\\src\\mod.c')).toBe('source')
  })
})

describe('dirBucket', () => {
  it('buckets by the first two path segments', () => {
    expect(dirBucket('src/core/foo.c')).toBe('src/core')
    expect(dirBucket('foo.c')).toBe('.')
    expect(dirBucket('a/foo.c')).toBe('a')
  })
})
