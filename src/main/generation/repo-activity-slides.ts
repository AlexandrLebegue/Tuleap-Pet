import type { RepoSprintStats } from '@shared/types'
import type { EnrichedContext } from './enricher'

/** Nombre max de slides « activité dépôt » (un dépôt = une slide). */
const REPO_SLIDES_CAP = 6

function esc(text: string): string {
  return text.replace(/[<>&]/g, ' ').trim()
}

function shortDate(iso: string | null): string | null {
  if (!iso) return null
  return iso.slice(0, 10) || null
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

/** Mind map sobre : le dépôt en racine, ses branches actives en éventail. */
function mindMap(stats: RepoSprintStats): string {
  const nodes = stats.activeBranches
    .map((b) => {
      const cls = b.isNew ? ' is-new' : b.isDefault ? ' is-default' : ''
      const badge = b.isNew
        ? '<span class="mm-badge">nouvelle</span>'
        : b.isDefault
          ? '<span class="mm-badge is-def">défaut</span>'
          : ''
      const date = shortDate(b.lastCommitDate)
      return `<div class="mm-node${cls}">
<span class="mm-count">${b.commits}</span>
<span class="mm-branch-info">
<span class="mm-branch-name">${esc(b.name)}</span>
<span class="mm-branch-meta">commit${b.commits > 1 ? 's' : ''}${date ? ` · ${date}` : ''} ${badge}</span>
</span>
</div>`
    })
    .join('\n')

  return `<div class="mindmap">
<div class="mm-root">
<span class="mm-root-name">${esc(stats.repoName)}</span>
<span class="mm-root-meta">${stats.activeBranches.length} branche${stats.activeBranches.length > 1 ? 's' : ''} active${stats.activeBranches.length > 1 ? 's' : ''}</span>
</div>
<div class="mm-links"></div>
<div class="mm-nodes">
${nodes}
</div>
</div>`
}

function buildOneRepoSlide(stats: RepoSprintStats, ctx: EnrichedContext): string {
  const sinceLabel = ctx.milestone?.startDate
    ? `depuis le ${ctx.milestone.startDate.slice(0, 10)}`
    : 'sur la période du sprint'
  const newBranches = stats.activeBranches.filter((b) => b.isNew).length
  const netLines = `+${compact(stats.additions)} / −${compact(stats.deletions)}`

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

  const mm =
    stats.activeBranches.length > 0
      ? `## Branches du sprint

${mindMap(stats)}`
      : `<div class="gov-empty">
<span>Aucune branche active ${sinceLabel}</span>
</div>`

  return `# Dépôt ${esc(stats.repoName)} — activité du sprint

<div class="slide-body">

<div class="big-grid">
${cards.join('\n')}
</div>

${mm}

</div>

<div class="slide-footer">
<small>Dépôt ${esc(stats.repoName)} · commits ${sinceLabel}, toutes branches · analyse du clone local</small>
</div>`
}

/**
 * Slides « une par dépôt Git » : gros chiffres de l'activité depuis le début
 * du sprint (commits, branches actives et nouvelles, fichiers modifiés,
 * lignes, contributeurs) + mind map des branches actives avec leur nombre de
 * commits. Nécessite le scan par clone (option « une slide par user story »).
 * 100 % déterministe — aucun appel LLM.
 */
export function buildRepoActivitySlides(ctx: EnrichedContext): string[] {
  const stats = ctx.codeActivity.repoSprintStats ?? []
  return stats
    .filter((s) => s.commits > 0 || s.activeBranches.length > 0)
    .sort((a, b) => b.commits - a.commits)
    .slice(0, REPO_SLIDES_CAP)
    .map((s) => buildOneRepoSlide(s, ctx))
}
