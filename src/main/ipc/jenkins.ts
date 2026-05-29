import { ipcMain } from 'electron'
import { buildJenkinsClient, JenkinsError } from '../jenkins'
import { resolveLlmProvider, toLlmError } from '../llm'
import { audit } from '../store/db'
import type {
  JenkinsBranchStatus,
  JenkinsBuildDetail,
  JenkinsBuildSummary,
  JenkinsConnectionTestResult,
  JenkinsFailureAnalysis,
  JenkinsJob,
  JenkinsNode,
  JenkinsQueueItem
} from '@shared/types'

function toConnectionResult(err: unknown): JenkinsConnectionTestResult {
  if (err instanceof JenkinsError) {
    return { ok: false, error: err.message, kind: err.kind, status: err.status }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { ok: false, error: message, kind: 'unknown' }
}

const MAX_CONSOLE_CHARS = 32_000

export function registerJenkinsHandlers(): void {
  ipcMain.handle('jenkins:test-connection', async (): Promise<JenkinsConnectionTestResult> => {
    audit('jenkins.test-connection')
    try {
      const client = buildJenkinsClient()
      const { version, nodeName } = await client.testConnection()
      return { ok: true, version, nodeName }
    } catch (err) {
      return toConnectionResult(err)
    }
  })

  ipcMain.handle(
    'jenkins:list-jobs',
    async (_event, args: unknown): Promise<JenkinsJob[]> => {
      const { folder } = (args ?? {}) as { folder?: string }
      audit('jenkins.list-jobs', folder ?? null)
      const client = buildJenkinsClient()
      return client.listJobs(folder)
    }
  )

  ipcMain.handle(
    'jenkins:get-branch-status',
    async (
      _event,
      args: unknown
    ): Promise<JenkinsBranchStatus | null> => {
      const { jobName, branchName } = args as { jobName: string; branchName: string }
      const client = buildJenkinsClient()
      return client.getBranchStatus(jobName, branchName)
    }
  )

  ipcMain.handle(
    'jenkins:get-build-history',
    async (_event, args: unknown): Promise<JenkinsBuildSummary[]> => {
      const { jobName, limit } = args as { jobName: string; limit?: number }
      audit('jenkins.get-build-history', jobName)
      const client = buildJenkinsClient()
      return client.getBuildHistory(jobName, limit)
    }
  )

  ipcMain.handle(
    'jenkins:get-build-detail',
    async (_event, args: unknown): Promise<JenkinsBuildDetail> => {
      const { jobName, buildNumber } = args as { jobName: string; buildNumber: number }
      audit('jenkins.get-build-detail', `${jobName}#${buildNumber}`)
      const client = buildJenkinsClient()
      return client.getBuildDetail(jobName, buildNumber)
    }
  )

  ipcMain.handle(
    'jenkins:get-console-text',
    async (_event, args: unknown): Promise<string> => {
      const { jobName, buildNumber } = args as { jobName: string; buildNumber: number }
      audit('jenkins.get-console-text', `${jobName}#${buildNumber}`)
      const client = buildJenkinsClient()
      const text = await client.getConsoleText(jobName, buildNumber)
      return text.length > MAX_CONSOLE_CHARS ? text.slice(-MAX_CONSOLE_CHARS) : text
    }
  )

  ipcMain.handle(
    'jenkins:investigate-failure',
    async (
      _event,
      args: unknown
    ): Promise<JenkinsFailureAnalysis | { ok: false; error: string; kind: string }> => {
      const { jobName, buildNumber } = args as { jobName: string; buildNumber: number }
      audit('jenkins.investigate-failure', `${jobName}#${buildNumber}`)
      try {
        const client = buildJenkinsClient()
        const [consoleRaw, detail] = await Promise.all([
          client.getConsoleText(jobName, buildNumber),
          client.getBuildDetail(jobName, buildNumber)
        ])
        const consoleText =
          consoleRaw.length > MAX_CONSOLE_CHARS ? consoleRaw.slice(-MAX_CONSOLE_CHARS) : consoleRaw
        const provider = resolveLlmProvider()
        const testSummary = detail.testReport
          ? `Tests: ${detail.testReport.totalCount} total, ${detail.testReport.failCount} failed, ${detail.testReport.skipCount} skipped`
          : 'No test report available'
        const systemPrompt = `You are a CI/CD expert. Analyze Jenkins build failures and provide structured, actionable diagnoses. Be concise and precise.`
        const userPrompt = `Analyze this Jenkins build failure and respond with a JSON object (only JSON, no markdown fence):
{
  "rootCause": "one-sentence explanation of the root cause",
  "affectedSteps": ["list", "of", "failed", "steps", "or", "files"],
  "suggestion": "concrete fix suggestion in 2-3 sentences",
  "severity": "error" | "warning" | "info"
}

Build: ${detail.fullDisplayName}
Result: ${detail.result}
${testSummary}
Parameters: ${detail.parameters.map((p) => `${p.name}=${String(p.value)}`).join(', ') || 'none'}

Console output (last ${MAX_CONSOLE_CHARS} chars):
${consoleText}`

        const result = await provider.generate({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          maxOutputTokens: 500
        })
        const text = result.text.trim()
        const jsonStart = text.indexOf('{')
        const jsonEnd = text.lastIndexOf('}')
        if (jsonStart === -1 || jsonEnd === -1) {
          return {
            rootCause: text,
            affectedSteps: [],
            suggestion: '',
            severity: 'error'
          } as JenkinsFailureAnalysis
        }
        const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as JenkinsFailureAnalysis
        return parsed
      } catch (err) {
        const e = toLlmError(err)
        return { ok: false, error: e.message, kind: e.kind }
      }
    }
  )

  ipcMain.handle('jenkins:get-queue', async (): Promise<JenkinsQueueItem[]> => {
    audit('jenkins.get-queue')
    const client = buildJenkinsClient()
    return client.getQueue()
  })

  ipcMain.handle('jenkins:get-nodes', async (): Promise<JenkinsNode[]> => {
    audit('jenkins.get-nodes')
    try {
      const client = buildJenkinsClient()
      return await client.getNodes()
    } catch (err) {
      if (err instanceof JenkinsError && err.kind === 'auth') {
        return []
      }
      throw err
    }
  })
}
