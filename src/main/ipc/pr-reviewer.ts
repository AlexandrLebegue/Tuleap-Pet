import { ipcMain } from 'electron'
import { execa } from 'execa'
import { mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { buildTuleapClient, mapArtifactDetail } from '../tuleap'
import { resolveLlmProvider } from '../llm'
import { audit } from '../store/db'
import { getConfig } from '../store/config'
import { execGit } from '../commenter/git-utils'
import { injectGitCredentials } from '../jobs/git-credentials'
import { getExpertSystemPrompt } from '../prompts/expert-prompts'
import { resolveCloneUrl } from '../tuleap/clone-url'
import {
  parseNameStatus,
  parseCommitLog,
  parseShortStat,
  newCppFiles,
  newNonTestCppFiles,
  changedTestFiles,
  countAddedTests,
  parsePercent,
  parseNeedsTests,
  scoreCodingRulesDeterministic,
  combineCompliance,
  type CodingRuleDeterministic,
  type CommitInfo,
  type SourceFile
} from '../pr-reviewer/analysis'
import type { ArtifactDetail, GitRepository } from '@shared/types'

export type PrReviewerPrSummary = {
  id: number
  title: string
  branchSrc: string
  branchDest: string
  status: string
  htmlUrl: string
}

export type PrReviewSections = {
  overview: boolean
  codingRules: boolean
  tests: boolean
  acceptanceCriteria: boolean
}

export type AcCoverage = 'covered' | 'partial' | 'missing' | 'unverifiable'

export type AcItem = {
  ac: string
  coverage: AcCoverage
  evidence: string
}

export type AcceptanceCriteriaReport = {
  applicable: boolean
  artifactId: number | null
  artifactTitle: string
  items: AcItem[]
  coveredCount: number
  message: string
}

export type OverviewReport = {
  summary: string
  commitCount: number
  filesChanged: number
  added: number
  removed: number
  newFiles: string[]
  commits: CommitInfo[]
}

export type CodingRulesReport = {
  applicable: boolean
  percent: number
  deterministic: CodingRuleDeterministic
  llmPercent: number | null
  justification: string
  files: string[]
}

export type TestsReport = {
  testsAdded: number
  testFiles: string[]
  needsTests: boolean
  rationale: string
}

export type PrReviewResult =
  | {
      ok: true
      overview?: OverviewReport
      codingRules?: CodingRulesReport
      tests?: TestsReport
      acceptanceCriteria?: AcceptanceCriteriaReport
      commentMarkdown: string
      posted: boolean
      postError?: string
    }
  | { ok: false; error: string }

type AnalyzeArgs = {
  prId: number
  repoId: number
  cloneUrl: string
  branchSrc: string
  branchDest: string
  sections: PrReviewSections
  artifactIdHint?: number | null
}

const MAX_FILE_CHARS = 8000
const MAX_FILES_FOR_LLM = 20

async function ensureRepoCloned(
  repoId: number,
  cloneUrl: string,
  branchSrc: string,
  branchDest: string
): Promise<string> {
  const tempClonePath = getConfig().tempClonePath
  if (!tempClonePath) throw new Error('Chemin de clonage non configuré dans les Paramètres.')
  const targetDir = join(tempClonePath, `pr-review-${repoId}`)
  const authenticatedUrl = await injectGitCredentials(cloneUrl)

  // Reuse the existing clone only if it's a full (non-shallow) clone. A shallow
  // or single-branch clone lacks the history/refs needed to diff PR branches.
  let usable = false
  try {
    await execGit(['rev-parse', '--git-dir'], targetDir)
    const { stdout } = await execa('git', ['-C', targetDir, 'rev-parse', '--is-shallow-repository'], {
      reject: false
    })
    usable = stdout.trim() === 'false'
  } catch {
    /* not cloned yet */
  }

  if (!usable) {
    await rm(targetDir, { recursive: true, force: true }).catch(() => {})
    await mkdir(targetDir, { recursive: true }).catch(() => {})
    // Full clone: every branch + full history, required to compute the diff and
    // commit list between the PR's source and destination branches.
    await execa('git', ['clone', authenticatedUrl, targetDir], { maxBuffer: 200 * 1024 * 1024 })
  }

  // Make sure both PR branches exist as remote-tracking refs and are up to date.
  await execa(
    'git',
    [
      '-C',
      targetDir,
      'fetch',
      '--no-tags',
      '--prune',
      'origin',
      `+refs/heads/${branchDest}:refs/remotes/origin/${branchDest}`,
      `+refs/heads/${branchSrc}:refs/remotes/origin/${branchSrc}`
    ],
    { reject: false }
  )
  return targetDir
}

async function readNewFileContents(
  repoPath: string,
  branchSrc: string,
  paths: string[]
): Promise<SourceFile[]> {
  const files: SourceFile[] = []
  for (const path of paths.slice(0, MAX_FILES_FOR_LLM)) {
    const { stdout, exitCode } = await execa(
      'git',
      ['-C', repoPath, 'show', `origin/${branchSrc}:${path}`],
      { maxBuffer: 4 * 1024 * 1024, reject: false }
    )
    if (exitCode === 0 && stdout) {
      files.push({ path, content: stdout.slice(0, MAX_FILE_CHARS) })
    }
  }
  return files
}

async function buildOverview(
  repoPath: string,
  branchSrc: string,
  branchDest: string,
  diff: string,
  newFileList: string[]
): Promise<OverviewReport> {
  const range = `origin/${branchDest}...origin/${branchSrc}`
  const { stdout: logOut } = await execa(
    'git',
    [
      '-C',
      repoPath,
      'log',
      '--pretty=format:%h\t%s\t%an',
      `origin/${branchDest}..origin/${branchSrc}`
    ],
    { maxBuffer: 2 * 1024 * 1024, reject: false }
  )
  const commits = parseCommitLog(logOut)
  const { stdout: statOut } = await execa('git', ['-C', repoPath, 'diff', '--shortstat', range], {
    reject: false
  })
  const stat = parseShortStat(statOut)

  const provider = resolveLlmProvider()
  const prompt = `Tu es un reviewer technique. Résume de façon concise et structurée les modifications apportées par cette Pull Request, à partir des commits et du diff.\n\nFais une synthèse en 3 à 6 points (puces markdown) : nouvelles fonctionnalités, fichiers/zones impactés, intention globale. Pas d'introduction ni de conclusion, juste les puces.\n\n# Commits\n${commits.map((c) => `- ${c.subject} (${c.author})`).join('\n') || '(aucun)'}\n\n# Diff\n\n\`\`\`diff\n${diff}\n\`\`\``
  let summary = ''
  try {
    const llm = await provider.generate({
      messages: [
        { role: 'system', content: 'Tu réponds en français, en puces markdown concises.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      maxOutputTokens: 800
    })
    summary = llm.text.trim()
  } catch (err) {
    summary = `_(Synthèse LLM indisponible : ${err instanceof Error ? err.message : String(err)})_`
  }

  return {
    summary,
    commitCount: commits.length,
    filesChanged: stat.filesChanged,
    added: stat.added,
    removed: stat.removed,
    newFiles: newFileList,
    commits
  }
}

async function buildCodingRules(files: SourceFile[]): Promise<CodingRulesReport> {
  if (files.length === 0) {
    return {
      applicable: false,
      percent: 0,
      deterministic: {
        docCoverage: 0,
        typeConvention: 0,
        commentDensity: 0,
        overall: 0,
        functionsTotal: 0,
        functionsDocumented: 0
      },
      llmPercent: null,
      justification: 'Aucun nouveau fichier C/C++ dans cette PR.',
      files: []
    }
  }

  const deterministic = scoreCodingRulesDeterministic(files)

  const provider = resolveLlmProvider()
  const filesBlock = files.map((f) => `### ${f.path}\n\`\`\`cpp\n${f.content}\n\`\`\``).join('\n\n')
  const prompt = `Tu es un expert C/C++ qui évalue le respect de règles de codage internes sur des FICHIERS NOUVELLEMENT AJOUTÉS.\n\nÉvalue surtout : conventions de nommage (préfixes us/c/p/e/r/l/d sur les variables, types Typ*), documentation des structures de contrôle, clarté des en-têtes de fonction.\n\nRéponds en DEUX lignes EXACTEMENT :\nPERCENT: <0-100>%\nJUSTIFICATION: <1 à 2 phrases citant les points forts/faibles>\n\n# Règles de codage de référence\n${getExpertSystemPrompt()}\n\n# Fichiers à évaluer\n${filesBlock}`
  let llmPercent: number | null = null
  let justification = ''
  try {
    const llm = await provider.generate({
      messages: [
        { role: 'system', content: 'Tu réponds strictement au format demandé, en français.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      maxOutputTokens: 400
    })
    const text = llm.text.trim()
    llmPercent = parsePercent(text)
    const jm = text.match(/JUSTIFICATION\s*:\s*([\s\S]+)/i)
    justification = (jm ? jm[1]! : text).trim().slice(0, 600)
  } catch (err) {
    justification = `Évaluation LLM indisponible (${err instanceof Error ? err.message : String(err)}). Score basé sur les heuristiques déterministes.`
  }

  return {
    applicable: true,
    percent: combineCompliance(deterministic.overall, llmPercent),
    deterministic,
    llmPercent,
    justification,
    files: files.map((f) => f.path)
  }
}

async function buildTests(
  diff: string,
  testFiles: string[],
  nonTestNewFiles: string[]
): Promise<TestsReport> {
  const testsAdded = countAddedTests(diff)

  if (nonTestNewFiles.length === 0) {
    return {
      testsAdded,
      testFiles,
      needsTests: false,
      rationale:
        'Aucun nouveau fichier source non-test ajouté : pas de besoin évident de nouveaux tests.'
    }
  }

  const provider = resolveLlmProvider()
  const prompt = `Tu es un reviewer technique. À partir du diff d'une PR, indique si le code AJOUTÉ nécessite des tests unitaires (gtest) qui semblent manquer.\n\nNouveaux fichiers source non-test : ${nonTestNewFiles.join(', ')}\nNombre de tests gtest détectés dans le diff : ${testsAdded}\n\nRéponds en DEUX lignes EXACTEMENT :\nBESOIN: OUI|NON\nRAISON: <1 à 2 phrases : quel code mériterait des tests / ce qui manque>\n\n# Diff\n\n\`\`\`diff\n${diff}\n\`\`\``
  let needsTests = nonTestNewFiles.length > 0
  let rationale = ''
  try {
    const llm = await provider.generate({
      messages: [
        { role: 'system', content: 'Tu réponds strictement au format demandé, en français.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      maxOutputTokens: 400
    })
    const text = llm.text.trim()
    needsTests = parseNeedsTests(text)
    const rm = text.match(/RAISON\s*:\s*([\s\S]+)/i)
    rationale = (rm ? rm[1]! : text).trim().slice(0, 600)
  } catch (err) {
    rationale = `Évaluation LLM indisponible (${err instanceof Error ? err.message : String(err)}).`
  }

  return { testsAdded, testFiles, needsTests, rationale }
}

function extractAcceptanceCriteria(detail: ArtifactDetail): string[] {
  const sources: string[] = []
  if (detail.description) sources.push(detail.description)
  for (const v of detail.values) {
    const label = (v.label || '').toLowerCase()
    if (label.includes('accept') || label.includes('critere') || label.includes('critère')) {
      const raw = (v as unknown as { value?: { value?: string } }).value
      const text = raw && typeof raw === 'object' && 'value' in raw ? String(raw.value ?? '') : ''
      if (text) sources.push(text)
    }
  }
  const lines = sources.join('\n').split(/\r?\n/)
  const ac: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    if (/^[-*•]\s+/.test(t) || /^\d+[.)]\s+/.test(t) || /^\[\s?[ x]\s?\]/i.test(t)) {
      ac.push(t.replace(/^[-*•\d.)\s]+|^\[\s?[ x]\s?\]\s*/i, '').trim())
    }
  }
  if (ac.length === 0 && detail.description) {
    return detail.description
      .split(/\.\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 12)
      .slice(0, 8)
  }
  return ac
}

function inferArtifactIdFromBranch(branch: string): number | null {
  const m = branch.match(/(?:^|[-/_])(\d{2,7})(?:[-_]|$)/)
  return m ? Number.parseInt(m[1]!, 10) : null
}

async function buildAcceptanceCriteria(
  diff: string,
  branchSrc: string,
  artifactIdHint: number | null | undefined
): Promise<AcceptanceCriteriaReport> {
  const empty = (message: string, artifactId: number | null = null): AcceptanceCriteriaReport => ({
    applicable: false,
    artifactId,
    artifactTitle: '',
    items: [],
    coveredCount: 0,
    message
  })

  const artifactId = artifactIdHint ?? inferArtifactIdFromBranch(branchSrc)
  if (!artifactId) {
    return empty(
      "Aucun artéfact lié : précisez l'ID Tuleap, ou nommez la branche avec l'ID (ex: 1234-ma-feature)."
    )
  }

  let detail: ArtifactDetail
  try {
    const client = await buildTuleapClient()
    detail = mapArtifactDetail(await client.getArtifact(artifactId))
  } catch (err) {
    return empty(
      `Impossible de récupérer l'artéfact #${artifactId} (${err instanceof Error ? err.message : String(err)}).`,
      artifactId
    )
  }

  const acItems = extractAcceptanceCriteria(detail)
  if (acItems.length === 0) {
    return empty(`Aucun critère d'acceptation trouvé dans l'artéfact #${artifactId}.`, artifactId)
  }

  const provider = resolveLlmProvider()
  const prompt = `Tu es un reviewer technique. Voici un diff git et une liste de critères d'acceptation (AC) du ticket lié.\n\nPour CHAQUE AC, dis si le diff le couvre :\n- covered : implémenté/testé clairement\n- partial : partiel ou conditionnel\n- missing : pas implémenté\n- unverifiable : impossible à vérifier sans contexte runtime\n\nRéponds STRICTEMENT en JSON :\n[{"ac":"...","coverage":"covered|partial|missing|unverifiable","evidence":"<1-2 phrases citant fichiers/fonctions du diff>"}, ...]\n\n# Critères d'acceptation\n${acItems.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\n# Diff\n\n\`\`\`diff\n${diff}\n\`\`\``

  let items: AcItem[]
  try {
    const llm = await provider.generate({
      messages: [
        { role: 'system', content: 'Tu réponds toujours en JSON valide, sans markdown autour.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      maxOutputTokens: 2000
    })
    const text = llm.text.trim().replace(/^```(?:json)?\s*|```$/g, '')
    items = JSON.parse(text) as AcItem[]
  } catch {
    items = acItems.map((ac) => ({
      ac,
      coverage: 'unverifiable' as const,
      evidence: 'Analyse LLM indisponible.'
    }))
  }

  return {
    applicable: true,
    artifactId,
    artifactTitle: detail.title ?? '',
    items,
    coveredCount: items.filter((i) => i.coverage === 'covered').length,
    message: ''
  }
}

function assembleComment(
  prId: number,
  overview: OverviewReport | undefined,
  codingRules: CodingRulesReport | undefined,
  tests: TestsReport | undefined,
  acceptanceCriteria: AcceptanceCriteriaReport | undefined
): string {
  const parts: string[] = [`# Revue automatique — PR #${prId}`]

  if (overview) {
    parts.push(
      '',
      '## État des lieux',
      '',
      `**${overview.commitCount} commit(s)** · **${overview.filesChanged} fichier(s)** modifié(s) (+${overview.added} / −${overview.removed})`,
      ...(overview.newFiles.length > 0
        ? ['', `Nouveaux fichiers : ${overview.newFiles.map((f) => `\`${f}\``).join(', ')}`]
        : []),
      '',
      overview.summary
    )
  }

  if (codingRules) {
    parts.push('', '## Respect des règles de codage', '')
    if (!codingRules.applicable) {
      parts.push('_Non applicable — aucun nouveau fichier C/C++._')
    } else {
      const d = codingRules.deterministic
      parts.push(
        `**Conformité globale : ${codingRules.percent}%**`,
        '',
        `- En-têtes de fonction documentés : ${d.docCoverage}% (${d.functionsDocumented}/${d.functionsTotal})`,
        `- Conventions de types : ${d.typeConvention}%`,
        `- Densité de commentaires : ${d.commentDensity}%`,
        ...(codingRules.llmPercent !== null
          ? [`- Évaluation conventions (LLM) : ${codingRules.llmPercent}%`]
          : []),
        '',
        codingRules.justification
      )
    }
  }

  if (tests) {
    parts.push(
      '',
      '## Tests',
      '',
      `**${tests.testsAdded} test(s)** gtest ajouté(s) dans cette PR.`,
      tests.needsTests
        ? '⚠️ Des tests supplémentaires semblent nécessaires.'
        : '✅ La couverture de tests paraît suffisante pour les changements.',
      '',
      tests.rationale
    )
  }

  if (acceptanceCriteria) {
    parts.push('', "## Respect des critères d'acceptation", '')
    if (!acceptanceCriteria.applicable) {
      parts.push(`_${acceptanceCriteria.message}_`)
    } else {
      const a = acceptanceCriteria
      parts.push(
        `Artéfact Tuleap #${a.artifactId}${a.artifactTitle ? ` — ${a.artifactTitle}` : ''}`,
        `**${a.coveredCount}/${a.items.length} critères couverts**`,
        '',
        ...a.items.map((it) => `- **${it.coverage}** — ${it.ac}\n  > ${it.evidence}`)
      )
    }
  }

  return parts.join('\n')
}

export function registerPrReviewerHandlers(): void {
  ipcMain.handle('pr-reviewer:list-repos', async (): Promise<GitRepository[]> => {
    try {
      const { projectId, tuleapUrl, gitCloneSsh } = getConfig()
      if (!projectId) return []
      const client = await buildTuleapClient()
      const page = await client.listGitRepositories(projectId, { limit: 50 })
      return page.items.map((raw) => ({
        id: raw.id,
        name: raw.name ?? '',
        description: raw.description ?? '',
        cloneUrl: resolveCloneUrl(raw, tuleapUrl, gitCloneSsh)
      }))
    } catch {
      return []
    }
  })

  ipcMain.handle(
    'pr-reviewer:list-prs',
    async (_evt, args: { repoId: number }): Promise<PrReviewerPrSummary[]> => {
      try {
        const client = await buildTuleapClient()
        const page = await client.listPullRequests(args.repoId, { limit: 50 })
        return page.items.map((raw) => ({
          id: raw.id,
          title: raw.title,
          branchSrc: raw.branch_src,
          branchDest: raw.branch_dest,
          status: raw.status,
          htmlUrl: raw.html_url
        }))
      } catch {
        return []
      }
    }
  )

  ipcMain.handle(
    'pr-reviewer:analyze',
    async (_evt, args: AnalyzeArgs): Promise<PrReviewResult> => {
      try {
        const { sections } = args
        if (
          !sections.overview &&
          !sections.codingRules &&
          !sections.tests &&
          !sections.acceptanceCriteria
        ) {
          return { ok: false, error: 'Aucune section activée à analyser.' }
        }

        const repoPath = await ensureRepoCloned(
          args.repoId,
          args.cloneUrl,
          args.branchSrc,
          args.branchDest
        )
        const range = `origin/${args.branchDest}...origin/${args.branchSrc}`

        const { stdout: diff } = await execa(
          'git',
          ['-C', repoPath, 'diff', range, '--', ':!*.lock', ':!*.min.js'],
          { maxBuffer: 4 * 1024 * 1024, reject: false }
        )
        const trimmedDiff = diff.length > 30000 ? diff.slice(0, 30000) + '\n…[truncated]' : diff

        const { stdout: nameStatusOut } = await execa(
          'git',
          ['-C', repoPath, 'diff', '--name-status', range],
          { maxBuffer: 2 * 1024 * 1024, reject: false }
        )
        const changes = parseNameStatus(nameStatusOut)
        const newFileList = changes.filter((c) => c.status.startsWith('A')).map((c) => c.path)
        const cppNewFiles = newCppFiles(changes)

        let overview: OverviewReport | undefined
        let codingRules: CodingRulesReport | undefined
        let tests: TestsReport | undefined
        let acceptanceCriteria: AcceptanceCriteriaReport | undefined

        if (sections.overview) {
          overview = await buildOverview(
            repoPath,
            args.branchSrc,
            args.branchDest,
            trimmedDiff,
            newFileList
          )
        }

        if (sections.codingRules) {
          const cppContents = await readNewFileContents(repoPath, args.branchSrc, cppNewFiles)
          codingRules = await buildCodingRules(cppContents)
        }

        if (sections.tests) {
          tests = await buildTests(
            trimmedDiff,
            changedTestFiles(changes),
            newNonTestCppFiles(changes)
          )
        }

        if (sections.acceptanceCriteria) {
          acceptanceCriteria = await buildAcceptanceCriteria(
            trimmedDiff,
            args.branchSrc,
            args.artifactIdHint
          )
        }

        const commentMarkdown = assembleComment(
          args.prId,
          overview,
          codingRules,
          tests,
          acceptanceCriteria
        )

        let posted = false
        let postError: string | undefined
        try {
          const client = await buildTuleapClient()
          await client.postPrComment(args.prId, commentMarkdown)
          posted = true
        } catch (err) {
          postError = err instanceof Error ? err.message : String(err)
        }

        audit('pr-reviewer.analyze', String(args.prId), {
          sections,
          cppNewFiles: cppNewFiles.length,
          posted
        })

        return {
          ok: true,
          overview,
          codingRules,
          tests,
          acceptanceCriteria,
          commentMarkdown,
          posted,
          postError
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
}
