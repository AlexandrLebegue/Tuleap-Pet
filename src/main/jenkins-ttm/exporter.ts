import type { JenkinsTtmExportProgress, JenkinsTtmExportResult } from '@shared/types'
import type { JenkinsClient } from '../jenkins/client'
import type { TuleapClient } from '../tuleap/client'
import type { TrackerRaw } from '../tuleap/schemas'
import { parseTestReport } from '../jenkins/junit-parser'
import {
  bulkSetDefinitions,
  getCachedDefinitionId,
  isCacheWarmed,
  markCacheWarmed,
  setCachedDefinitionId
} from './ttm-cache'

export type TtmExportArgs = {
  jobName: string
  buildNumber: number
  branchName: string
  projectId: number
  buildUrl: string
}

async function autoDetectTracker(tuleap: TuleapClient, projectId: number): Promise<number> {
  const all: TrackerRaw[] = []
  let offset = 0
  while (true) {
    const page = await tuleap.listTrackers(projectId, { limit: 50, offset })
    all.push(...page.items)
    if (page.items.length === 0 || all.length >= page.total) break
    offset += page.items.length
  }
  const match = all.find(
    (t) =>
      t.item_name?.toLowerCase() === 'test' ||
      t.label?.toLowerCase().includes('test definition') ||
      t.label?.toLowerCase() === 'tests'
  )
  if (!match) {
    throw new Error(
      `Impossible de détecter automatiquement le tracker TTM dans le projet ${projectId}. ` +
        'Configurez le "TTM Tracker ID" dans les Paramètres Jenkins.'
    )
  }
  return match.id
}

async function warmCache(
  projectId: number,
  trackerId: number,
  tuleap: TuleapClient
): Promise<void> {
  const all = await tuleap.fetchAll((offset) =>
    tuleap.listArtifacts(trackerId, { values: 'summary', limit: 100, offset })
  )
  const entries = all
    .filter((a) => a.title && a.title.trim().length > 0)
    .map((a) => ({ fullName: a.title!, id: a.id }))
  bulkSetDefinitions(projectId, entries)
  markCacheWarmed(projectId, trackerId)
}

export async function exportBuildToTtm(
  args: TtmExportArgs,
  jenkins: JenkinsClient,
  tuleap: TuleapClient,
  ttmTrackerId: number | null,
  onProgress: (event: JenkinsTtmExportProgress) => void
): Promise<JenkinsTtmExportResult> {
  const rawReport = await jenkins.getTestReport(args.jobName, args.buildNumber)
  const report = parseTestReport(rawReport)

  if (report.cases.length === 0) {
    throw new Error('Aucun cas de test dans le rapport JUnit.')
  }

  const trackerId = ttmTrackerId ?? (await autoDetectTracker(tuleap, args.projectId))

  const date = new Date().toLocaleDateString('fr-FR')
  const campaignLabel = `${args.jobName}/${args.branchName} — Build #${args.buildNumber} — ${date}`
  const campaign = await tuleap.createTtmCampaign({
    label: campaignLabel,
    projectId: args.projectId
  })
  const campaignId = campaign.id
  const campaignUrl =
    `${tuleap.getBaseUrl()}/plugins/testmanagement/?group_id=${args.projectId}` +
    `#/campaigns/${campaignId}`

  onProgress({ type: 'start', total: report.cases.length, campaignId, campaignLabel })

  if (!isCacheWarmed(args.projectId, trackerId)) {
    await warmCache(args.projectId, trackerId, tuleap)
  }

  const structure = await tuleap.getTrackerFields(trackerId)
  const titleFieldId = structure.semantics?.title?.field_id ?? null
  const descriptionFieldId = structure.semantics?.description?.field_id ?? null

  if (!titleFieldId) {
    throw new Error(
      `Le tracker TTM ${trackerId} n'a pas de champ titre défini dans ses sémantiques.`
    )
  }

  let done = 0
  let newDefinitions = 0
  let passed = 0
  let failed = 0
  let blocked = 0

  for (const testCase of report.cases) {
    onProgress({ type: 'progress', done, total: report.cases.length, currentTest: testCase.fullName })

    let defId = getCachedDefinitionId(args.projectId, testCase.fullName)

    if (defId === null) {
      const artifact = await tuleap.createArtifact({
        trackerId,
        titleFieldId,
        title: testCase.fullName,
        descriptionFieldId: descriptionFieldId ?? null,
        description: testCase.className,
        statusFieldId: null,
        statusBindValueId: null
      })
      defId = artifact.id
      setCachedDefinitionId(args.projectId, testCase.fullName, defId)
      newDefinitions++
    }

    const resultText = [`Build Jenkins: ${args.buildUrl}`, testCase.errorDetails ?? '']
      .filter(Boolean)
      .join('\n')

    await tuleap.createTtmTestExecution({
      campaignId,
      testDefinitionId: defId,
      status: testCase.status,
      result: resultText || null
    })

    if (testCase.status === 'passed') passed++
    else if (testCase.status === 'failed') failed++
    else blocked++

    done++
  }

  const result: JenkinsTtmExportResult = {
    campaignId,
    campaignUrl,
    total: report.cases.length,
    passed,
    failed,
    blocked,
    newDefinitions
  }

  onProgress({ type: 'done', result })
  return result
}
