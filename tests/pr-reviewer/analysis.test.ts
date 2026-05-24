import { describe, expect, it } from 'vitest'
import {
  parseNameStatus,
  newFiles,
  newCppFiles,
  newNonTestCppFiles,
  changedTestFiles,
  isCppFile,
  isTestPath,
  countAddedTests,
  parsePercent,
  parseNeedsTests,
  parseCommitLog,
  parseShortStat,
  scoreCodingRulesDeterministic,
  combineCompliance
} from '../../src/main/pr-reviewer/analysis'

describe('parseNameStatus', () => {
  it('parses added/modified/deleted entries', () => {
    const out = 'A\tsrc/a.cpp\nM\tsrc/b.cpp\nD\tsrc/old.cpp'
    const changes = parseNameStatus(out)
    expect(changes).toEqual([
      { status: 'A', path: 'src/a.cpp' },
      { status: 'M', path: 'src/b.cpp' },
      { status: 'D', path: 'src/old.cpp' }
    ])
  })

  it('uses the destination path for renames', () => {
    const out = 'R100\tsrc/old.cpp\tsrc/new.cpp'
    expect(parseNameStatus(out)).toEqual([{ status: 'R100', path: 'src/new.cpp' }])
  })

  it('ignores blank lines and CRs', () => {
    expect(parseNameStatus('\nA\tx.c\r\n')).toEqual([{ status: 'A', path: 'x.c' }])
  })
})

describe('file classification', () => {
  it('detects C/C++ extensions', () => {
    expect(isCppFile('a.cpp')).toBe(true)
    expect(isCppFile('a.H')).toBe(true)
    expect(isCppFile('a.ts')).toBe(false)
  })

  it('detects test paths', () => {
    expect(isTestPath('tests/foo_test.cpp')).toBe(true)
    expect(isTestPath('src/foo.test.cpp')).toBe(true)
    expect(isTestPath('src/foo.cpp')).toBe(false)
  })

  it('filters new C/C++ files and excludes tests from non-test set', () => {
    const changes = parseNameStatus(
      ['A\tsrc/calc.cpp', 'A\ttests/calc_test.cpp', 'A\tdoc/readme.md', 'M\tsrc/old.cpp'].join('\n')
    )
    expect(newFiles(changes)).toEqual(['src/calc.cpp', 'tests/calc_test.cpp', 'doc/readme.md'])
    expect(newCppFiles(changes)).toEqual(['src/calc.cpp', 'tests/calc_test.cpp'])
    expect(newNonTestCppFiles(changes)).toEqual(['src/calc.cpp'])
    expect(changedTestFiles(changes)).toEqual(['tests/calc_test.cpp'])
  })
})

describe('countAddedTests', () => {
  it('counts gtest declarations on added lines only', () => {
    const diff = [
      '+++ b/tests/x_test.cpp',
      '+TEST(Suite, Case1) {',
      '+  EXPECT_EQ(1, 1);',
      '+}',
      '+TEST_F(Fixture, Case2) {}',
      '-TEST(Removed, Old) {}',
      ' TEST_P(Context, NotAdded) {}'
    ].join('\n')
    expect(countAddedTests(diff)).toBe(2)
  })

  it('returns 0 when no tests added', () => {
    expect(countAddedTests('+int x = 1;')).toBe(0)
  })
})

describe('parsePercent', () => {
  it('extracts and clamps a percentage', () => {
    expect(parsePercent('PERCENT: 82%')).toBe(82)
    expect(parsePercent('around 150%')).toBe(100)
    expect(parsePercent('no number here')).toBeNull()
  })
})

describe('parseNeedsTests', () => {
  it('reads OUI/NON verdicts', () => {
    expect(parseNeedsTests('OUI\nRAISON: ...')).toBe(true)
    expect(parseNeedsTests('NON, déjà couvert')).toBe(false)
    expect(parseNeedsTests('NO need')).toBe(false)
  })
})

describe('parseCommitLog / parseShortStat', () => {
  it('parses commit log lines', () => {
    const commits = parseCommitLog('abc123\tAdd feature\tAlice\ndef456\tFix bug\tBob')
    expect(commits).toEqual([
      { hash: 'abc123', subject: 'Add feature', author: 'Alice' },
      { hash: 'def456', subject: 'Fix bug', author: 'Bob' }
    ])
  })

  it('parses shortstat', () => {
    expect(parseShortStat(' 3 files changed, 42 insertions(+), 7 deletions(-)')).toEqual({
      filesChanged: 3,
      added: 42,
      removed: 7
    })
  })
})

describe('combineCompliance', () => {
  it('averages deterministic and LLM scores', () => {
    expect(combineCompliance(80, 60)).toBe(70)
  })
  it('falls back to deterministic when LLM percent is null', () => {
    expect(combineCompliance(80, null)).toBe(80)
  })
})

describe('scoreCodingRulesDeterministic', () => {
  const COMPLIANT = `/*----------------------------------------------------------------------------*/
/*! \\brief Calcule la somme de deux entiers.
 * \\param [in] lA premier
 * \\param [in] lB second
 * \\return somme */
/*----------------------------------------------------------------------------*/
TypC32 lAdd(TypC32 lA, TypC32 lB)
{
    return lA + lB;
}
`

  const NON_COMPLIANT = `int add(int a, int b)
{
    return a + b;
}
float div(float a, float b)
{
    return a / b;
}
`

  it('rewards documented functions and custom types', () => {
    const score = scoreCodingRulesDeterministic([{ path: 'good.c', content: COMPLIANT }])
    expect(score.functionsTotal).toBe(1)
    expect(score.functionsDocumented).toBe(1)
    expect(score.docCoverage).toBe(100)
    expect(score.typeConvention).toBeGreaterThan(50)
  })

  it('penalises undocumented functions and raw types', () => {
    const score = scoreCodingRulesDeterministic([{ path: 'bad.c', content: NON_COMPLIANT }])
    expect(score.docCoverage).toBe(0)
    expect(score.typeConvention).toBe(0)
    expect(score.overall).toBeLessThan(
      scoreCodingRulesDeterministic([{ path: 'good.c', content: COMPLIANT }]).overall
    )
  })
})
