import type { RepoSprintStats } from '@shared/types'
import type { EnrichedContext } from './enricher'

/** Nombre max de slides « activité dépôt » (un dépôt = une slide). */
const REPO_SLIDES_CAP = 6
/** Branches affichées dans le graphique en barres. */
const BAR_BRANCH_CAP = 6

function esc(text: string): string {
  return text.replace(/[<>&]/g, ' ').trim()
}

/** 12 345 → « 12,3k » pour que les gros chiffres restent lisibles. */
function compact(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`
  if (n >= 1_000) return `${(n / 1000).toFixed(1).replace('.', ',')}k`
  return String(n)
}

function bigCard(value: string, label: string, accent = ''): string {
  return `<div class="big-card${accent ? ` ${accent}` : ''}">
<span class="big-value">${value}</span>
<span class="big-label">${label}</span>
</div>`
}

/**
 * Graphique en barres « commits par branche » : longueurs relatives à la
 * branche la plus active, via les classes de largeur w-0…w-100 du thème
 * (aucun style inline — Marp les supprimerait).
 */
function branchBars(stats: RepoSprintStats): string {
  const branches = [...stats.activeBranches]
    .sort((a, b) => b.commits - a.commits)
    .slice(0, BAR_BRANCH_CAP)
  const max = Math.max(...branches.map((b) => b.commits), 1)

  const rows = branches
    .map((b) => {
      const pct = Math.max(4, Math.round((b.commits / max) * 100))
      const badge = b.isNew
        ? ' <span class="bar-badge">nouvelle</span>'
        : b.isDefault
          ? ' <span class="bar-badge is-def">défaut</span>'
          : ''
      const fill = b.isNew ? 'bar-fill is-new' : 'bar-fill'
      return `<div class="bar-row">
<span class="bar-name">${esc(b.name)}${badge}</span>
<span class="bar-track"><span class="${fill} w-${pct}"></span></span>
<span class="bar-value">${b.commits}</span>
</div>`
    })
    .join('\n')

  const overflow =
    stats.activeBranches.length > BAR_BRANCH_CAP
      ? `\n<div class="bar-more">… et ${stats.activeBranches.length - BAR_BRANCH_CAP} autre(s) branche(s) active(s)</div>`
      : ''

  return `<div class="bars">
${rows}${overflow}
</div>`
}

function buildOneRepoSlide(stats: RepoSprintStats, ctx: EnrichedContext): string {
  const since = ctx.milestone?.startDate ? ctx.milestone.startDate.slice(0, 10) : null
  const newBranches = stats.activeBranches.filter((b) => b.isNew).length
  const netLines = `+${compact(stats.additions)} −${compact(stats.deletions)}`

  const cards = [
    bigCard(compact(stats.commits), 'Commits', 'is-primary'),
    bigCard(
      String(stats.activeBranches.length),
      newBranches > 0
        ? `Branches actives · ${newBranches} nouvelle${newBranches > 1 ? 's' : ''}`
        : 'Branches actives'
    ),
    bigCard(compact(stats.filesChanged), 'Fichiers modifiés'),
    bigCard(netLines, 'Lignes ajoutées / retirées'),
    bigCard(String(stats.authors), `Contributeur${stats.authors > 1 ? 's' : ''}`)
  ]

  const branchesBlock =
    stats.activeBranches.length > 0
      ? `## Commits par branche

${branchBars(stats)}`
      : `<div class="bar-more">Aucune branche active sur la période.</div>`

  return `<!-- _class: repo -->

# ${esc(stats.repoName)}

<div class="slide-body">

<div class="repo-kicker">Activité du dépôt${since ? ` · depuis le ${since}` : ' · période du sprint'}</div>

<div class="big-grid">
${cards.join('\n')}
</div>

${branchesBlock}

</div>

<div class="slide-footer">
<small>Dépôt ${esc(stats.repoName)} · toutes branches · analyse du clone local</small>
</div>`
}

/**
 * Slides « une par dépôt Git », en style chapitre sombre : gros chiffres de
 * l'activité depuis le début du sprint (commits, branches actives et
 * nouvelles, fichiers modifiés, lignes, contributeurs) + graphique en barres
 * des commits par branche. Nécessite le scan par clone (option « une slide
 * par user story »). 100 % déterministe — aucun appel LLM.
 */
export function buildRepoActivitySlides(ctx: EnrichedContext): string[] {
  const stats = ctx.codeActivity.repoSprintStats ?? []
  return stats
    .filter((s) => s.commits > 0 || s.activeBranches.length > 0)
    .sort((a, b) => b.commits - a.commits)
    .slice(0, REPO_SLIDES_CAP)
    .map((s) => buildOneRepoSlide(s, ctx))
}
