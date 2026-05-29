import { describe, it, expect } from 'vitest'
import { parseTestReport } from '../src/main/jenkins/junit-parser'
import type { JenkinsTestReportRaw } from '../src/main/jenkins/schemas'

function makeReport(cases: JenkinsTestReportRaw['suites'][0]['cases']): JenkinsTestReportRaw {
  const pass = cases.filter((c) => ['PASSED', 'FIXED'].includes(c.status ?? '')).length
  const fail = cases.filter((c) => ['FAILED', 'ERROR', 'REGRESSION'].includes(c.status ?? '')).length
  const skip = cases.filter((c) => c.status === 'SKIPPED').length
  return {
    duration: 1,
    failCount: fail,
    passCount: pass,
    skipCount: skip,
    suites: [{ name: 'Suite', duration: 1, cases }]
  } as JenkinsTestReportRaw
}

describe('parseTestReport', () => {
  it('maps PASSED status to passed', () => {
    const raw = makeReport([{ name: 'testFoo', className: 'com.example.FooTest', status: 'PASSED', duration: 0.1 }])
    const report = parseTestReport(raw)
    expect(report.cases).toHaveLength(1)
    expect(report.cases[0]!.status).toBe('passed')
    expect(report.cases[0]!.fullName).toBe('com.example.FooTest::testFoo')
  })

  it('maps FIXED status to passed', () => {
    const raw = makeReport([{ name: 't', className: 'Foo', status: 'FIXED', duration: 0 }])
    expect(parseTestReport(raw).cases[0]!.status).toBe('passed')
  })

  it('maps FAILED status to failed', () => {
    const raw = makeReport([{ name: 'testBar', className: 'BarTest', status: 'FAILED', duration: 0, errorDetails: 'AssertionError' }])
    const report = parseTestReport(raw)
    expect(report.cases[0]!.status).toBe('failed')
    expect(report.cases[0]!.errorDetails).toBe('AssertionError')
  })

  it('maps ERROR status to failed', () => {
    const raw = makeReport([{ name: 't', className: 'C', status: 'ERROR', duration: 0 }])
    expect(parseTestReport(raw).cases[0]!.status).toBe('failed')
  })

  it('maps REGRESSION status to failed', () => {
    const raw = makeReport([{ name: 't', className: 'C', status: 'REGRESSION', duration: 0 }])
    expect(parseTestReport(raw).cases[0]!.status).toBe('failed')
  })

  it('maps SKIPPED status to blocked', () => {
    const raw = makeReport([{ name: 'testSkip', className: 'SkipTest', status: 'SKIPPED', duration: 0 }])
    expect(parseTestReport(raw).cases[0]!.status).toBe('blocked')
  })

  it('builds fullName from className and testName', () => {
    const raw = makeReport([{ name: 'myTest', className: 'org.pkg.MyClass', status: 'PASSED', duration: 0 }])
    expect(parseTestReport(raw).cases[0]!.fullName).toBe('org.pkg.MyClass::myTest')
  })

  it('falls back to suite name when className is empty', () => {
    const raw: JenkinsTestReportRaw = {
      duration: 0, failCount: 0, passCount: 1, skipCount: 0,
      suites: [{ name: 'SuiteName', duration: 0, cases: [{ name: 'test', className: '', status: 'PASSED', duration: 0 }] }]
    } as JenkinsTestReportRaw
    const report = parseTestReport(raw)
    expect(report.cases[0]!.className).toBe('SuiteName')
    expect(report.cases[0]!.fullName).toBe('SuiteName::test')
  })

  it('aggregates counts', () => {
    const raw = makeReport([
      { name: 'a', className: 'X', status: 'PASSED', duration: 0 },
      { name: 'b', className: 'X', status: 'FAILED', duration: 0 },
      { name: 'c', className: 'X', status: 'SKIPPED', duration: 0 }
    ])
    const report = parseTestReport(raw)
    expect(report.passCount).toBe(1)
    expect(report.failCount).toBe(1)
    expect(report.skipCount).toBe(1)
    expect(report.totalCount).toBe(3)
  })

  it('returns empty cases for empty suites', () => {
    const raw: JenkinsTestReportRaw = {
      duration: 0, failCount: 0, passCount: 0, skipCount: 0, suites: []
    } as JenkinsTestReportRaw
    expect(parseTestReport(raw).cases).toHaveLength(0)
  })
})
