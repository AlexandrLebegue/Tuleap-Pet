import { z } from 'zod'
import { tool, type Tool } from 'ai'
import { buildJenkinsClient, JenkinsError } from '../jenkins'
import { getJenkinsUrl } from '../store/config'
import { hasJenkinsToken } from '../store/secrets'
import { parseTestReport } from '../jenkins/junit-parser'
import { audit } from '../store/db'

function isJenkinsConfigured(): boolean {
  return Boolean(getJenkinsUrl() && hasJenkinsToken())
}

function safeError(err: unknown): { error: string } {
  if (err instanceof JenkinsError) return { error: `Jenkins: ${err.message}` }
  return { error: err instanceof Error ? err.message : String(err) }
}

export function buildJenkinsTools(): Record<string, Tool> {
  if (!isJenkinsConfigured()) return {}

  return {
    jenkins_list_jobs: tool({
      description:
        'Liste les jobs Jenkins. Sans paramètre = racine. Avec folder = contenu du dossier. ' +
        'Exemple : jenkins_list_jobs {} → liste tous les jobs racine. ' +
        'Exemple : jenkins_list_jobs { folder: "mon-api" } → jobs dans le dossier mon-api.',
      inputSchema: z.object({
        folder: z.string().optional().describe('Nom du dossier Jenkins à lister (optionnel)')
      }),
      async execute(input): Promise<unknown> {
        const args = input as { folder?: string }
        audit('chat.tool', 'jenkins_list_jobs', args)
        try {
          const client = buildJenkinsClient()
          const jobs = await client.listJobs(args.folder)
          return jobs.map((j) => ({
            name: j.name,
            displayName: j.displayName,
            status: j.color,
            lastBuildResult: j.lastBuildResult,
            lastBuildNumber: j.lastBuildNumber,
            isFolder: j.isFolder
          }))
        } catch (err) {
          return safeError(err)
        }
      }
    }),

    jenkins_get_build_history: tool({
      description:
        'Derniers builds d\'un job Jenkins. jobName obligatoire. limit optionnel (défaut 10, max 25). ' +
        'Exemple : jenkins_get_build_history { jobName: "mon-api" } → 10 derniers builds. ' +
        'Exemple : jenkins_get_build_history { jobName: "mon-api", limit: 5 } → 5 derniers builds.',
      inputSchema: z.object({
        jobName: z.string().min(1).describe('Nom exact du job Jenkins'),
        limit: z.number().int().min(1).max(25).optional().describe('Nombre de builds à retourner (défaut 10)')
      }),
      async execute(input): Promise<unknown> {
        const args = input as { jobName: string; limit?: number }
        audit('chat.tool', 'jenkins_get_build_history', args)
        try {
          const client = buildJenkinsClient()
          const builds = await client.getBuildHistory(args.jobName, args.limit ?? 10)
          return builds.map((b) => ({
            number: b.number,
            displayName: b.displayName,
            result: b.result,
            duration_s: b.duration !== null ? Math.round(b.duration / 1000) : null,
            timestamp: b.timestamp,
            building: b.building
          }))
        } catch (err) {
          return safeError(err)
        }
      }
    }),

    jenkins_get_build_detail: tool({
      description:
        'Détails complets d\'un build Jenkins : résultat, durée, paramètres, résumé des tests. ' +
        'jobName et buildNumber obligatoires. ' +
        'Exemple : jenkins_get_build_detail { jobName: "mon-api", buildNumber: 42 } → détails du build #42.',
      inputSchema: z.object({
        jobName: z.string().min(1).describe('Nom exact du job Jenkins'),
        buildNumber: z.number().int().positive().describe('Numéro du build')
      }),
      async execute(input): Promise<unknown> {
        const args = input as { jobName: string; buildNumber: number }
        audit('chat.tool', 'jenkins_get_build_detail', args)
        try {
          const client = buildJenkinsClient()
          const b = await client.getBuildDetail(args.jobName, args.buildNumber)
          return {
            number: b.number,
            displayName: b.displayName,
            result: b.result,
            building: b.building,
            duration_s: b.duration !== null ? Math.round(b.duration / 1000) : null,
            timestamp: b.timestamp,
            description: b.description,
            url: b.url,
            parameters: b.parameters,
            testReport: b.testReport
          }
        } catch (err) {
          return safeError(err)
        }
      }
    }),

    jenkins_get_test_report: tool({
      description:
        'Rapport JUnit d\'un build Jenkins : total / passés / échoués / ignorés + liste des tests échoués (max 20). ' +
        'jobName et buildNumber obligatoires. ' +
        'Exemple : jenkins_get_test_report { jobName: "mon-api", buildNumber: 42 } → résultats des tests du build #42.',
      inputSchema: z.object({
        jobName: z.string().min(1).describe('Nom exact du job Jenkins'),
        buildNumber: z.number().int().positive().describe('Numéro du build')
      }),
      async execute(input): Promise<unknown> {
        const args = input as { jobName: string; buildNumber: number }
        audit('chat.tool', 'jenkins_get_test_report', args)
        try {
          const client = buildJenkinsClient()
          const raw = await client.getTestReport(args.jobName, args.buildNumber)
          const report = parseTestReport(raw)
          return {
            total: report.totalCount,
            passed: report.passCount,
            failed: report.failCount,
            skipped: report.skipCount,
            failedCases: report.cases
              .filter((c) => c.status === 'failed')
              .slice(0, 20)
              .map((c) => ({
                name: c.fullName,
                errorDetails: c.errorDetails
              }))
          }
        } catch (err) {
          return safeError(err)
        }
      }
    }),

    jenkins_get_queue: tool({
      description:
        'File d\'attente Jenkins. Aucun paramètre. ' +
        'Exemple : jenkins_get_queue {} → liste des builds en attente.',
      inputSchema: z.object({}),
      async execute(): Promise<unknown> {
        audit('chat.tool', 'jenkins_get_queue')
        try {
          const client = buildJenkinsClient()
          const queue = await client.getQueue()
          return queue.map((q) => ({
            id: q.id,
            jobName: q.jobName,
            why: q.why,
            blocked: q.blocked,
            buildable: q.buildable
          }))
        } catch (err) {
          return safeError(err)
        }
      }
    })
  }
}
