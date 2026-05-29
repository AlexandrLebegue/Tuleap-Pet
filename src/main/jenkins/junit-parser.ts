import type { JenkinsTestCase, JenkinsTestReport } from '@shared/types'
import type { JenkinsTestReportRaw } from './schemas'

function toTtmStatus(junitStatus: string): JenkinsTestCase['status'] {
  const s = junitStatus.toUpperCase()
  if (s === 'PASSED' || s === 'FIXED') return 'passed'
  if (s === 'SKIPPED') return 'blocked'
  return 'failed'
}

export function parseTestReport(raw: JenkinsTestReportRaw): JenkinsTestReport {
  const cases: JenkinsTestCase[] = []

  for (const suite of raw.suites) {
    for (const c of suite.cases) {
      const className = (c.className && c.className.trim()) || suite.name || 'Unknown'
      const testName = (c.name && c.name.trim()) || 'unknown'
      cases.push({
        fullName: `${className}::${testName}`,
        className,
        testName,
        status: toTtmStatus(c.status),
        duration: c.duration,
        errorDetails: c.errorDetails ?? null,
        errorStackTrace: c.errorStackTrace ?? null
      })
    }
  }

  return {
    totalCount: raw.failCount + raw.passCount + raw.skipCount,
    failCount: raw.failCount,
    skipCount: raw.skipCount,
    passCount: raw.passCount,
    cases
  }
}
