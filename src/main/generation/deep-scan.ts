/**
 * Scan « profond » des branches : clone chaque dépôt Git du projet pour
 * inventorier ses branches localement (ahead/behind, dernier commit exact).
 * Chargé dynamiquement par l'enricher uniquement quand l'option « une slide
 * par user story » est cochée — ce module tire electron-store via la config.
 */
import type { CodeBranchInfo } from '@shared/types'
import { getConfig } from '../store/config'
import { resolveCloneUrl } from '../tuleap/clone-url'
import { injectGitCredentials } from '../jobs/git-credentials'
import { scanRepoBranchesByClone } from './git-branch-scanner'
import type { GitRepositoryRaw } from '../tuleap/schemas'

export type DeepScanResult = {
  branches: CodeBranchInfo[]
  branchesScanned: number
  clonedRepos: number
  warnings: string[]
}

export async function deepScanBranches(
  repos: GitRepositoryRaw[],
  knownIds: Set<number>
): Promise<DeepScanResult> {
  const { tempClonePath, gitCloneSsh, tuleapUrl } = getConfig()
  const result: DeepScanResult = { branches: [], branchesScanned: 0, clonedRepos: 0, warnings: [] }

  if (!tempClonePath) {
    result.warnings.push(
      'Aucun dossier temporaire configuré dans les réglages : recherche de branches par clone désactivée.'
    )
    return result
  }

  // Clones séquentiels : plusieurs clones simultanés saturent disque et réseau
  // pour un gain marginal, et le best-effort par dépôt reste simple à suivre.
  for (const repo of repos) {
    const repoName = repo.name || repo.path_without_project || repo.path || `repo-${repo.id}`
    try {
      const url = resolveCloneUrl(repo, tuleapUrl, gitCloneSsh)
      if (!url) {
        result.warnings.push(`URL de clone introuvable pour le dépôt ${repoName}.`)
        continue
      }
      const credUrl = gitCloneSsh ? url : await injectGitCredentials(url)
      const scan = await scanRepoBranchesByClone({
        repoName,
        cloneUrl: credUrl,
        knownIds,
        tempClonePath
      })
      result.branches.push(...scan.branches)
      result.branchesScanned += scan.branchesScanned
      result.clonedRepos++
    } catch (err) {
      result.warnings.push(
        `Clone du dépôt ${repoName} impossible : ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
  return result
}
