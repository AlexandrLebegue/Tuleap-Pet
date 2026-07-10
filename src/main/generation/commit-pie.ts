import type { SprintCodeActivity } from '@shared/types'

/** Palette du donut (déclinaison sobre du thème) — synchronisée avec .pie-c0…c6. */
export const PIE_COLORS = [
  '#1a365d',
  '#2b6cb0',
  '#63b3ed',
  '#2f855a',
  '#dd6b20',
  '#805ad5',
  '#718096'
]

const MAX_SLICES = 6

function esc(text: string): string {
  return text.replace(/[<>&"]/g, ' ').trim()
}

/** 12 345 → « 12,3k ». */
function compact(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`
  if (n >= 1_000) return `${(n / 1000).toFixed(1).replace('.', ',')}k`
  return String(n)
}

type Slice = { repoName: string; commits: number }

/** Parts du donut (traîne regroupée dans « Autres »), triées par volume. */
function computeSlices(activity: SprintCodeActivity): { slices: Slice[]; total: number } {
  const data = (activity.commitsByRepo ?? []).filter((r) => r.commits > 0)
  const total = data.reduce((sum, r) => sum + r.commits, 0)
  const sorted = [...data].sort((a, b) => b.commits - a.commits)
  const head = sorted.slice(0, MAX_SLICES)
  const tail = sorted.slice(MAX_SLICES)
  const slices: Slice[] = [...head]
  if (tail.length > 0) {
    slices.push({
      repoName: `Autres (${tail.length})`,
      commits: tail.reduce((s, r) => s + r.commits, 0)
    })
  }
  return { slices, total }
}

/**
 * Règle CSS du donut, injectée dans le thème du deck (frontmatter `style:`).
 * Marp supprime les attributs `style` inline du HTML des slides, mais le CSS
 * du thème passe intact de la préview à l'export PPTX — le gradient dynamique
 * vit donc dans le thème, et le HTML ne porte que des classes.
 */
export function buildCommitPieCss(activity: SprintCodeActivity): string {
  const { slices, total } = computeSlices(activity)
  if (slices.length === 0 || total === 0) return ''
  const stops: string[] = []
  let acc = 0
  slices.forEach((s, i) => {
    const from = (acc / total) * 100
    acc += s.commits
    const to = (acc / total) * 100
    stops.push(`${PIE_COLORS[i % PIE_COLORS.length]} ${from.toFixed(1)}% ${to.toFixed(1)}%`)
  })
  return `.pie-chart { background: conic-gradient(${stops.join(', ')}); }`
}

/**
 * Bloc « activité des dépôts » du slide équipe : donut des commits par dépôt
 * (gradient porté par le thème, voir buildCommitPieCss), légende, total au
 * centre et compteurs sobres (branches créées, lignes implémentées). Retourne
 * un placeholder explicite quand les données ne sont pas disponibles (le
 * comptage nécessite le scan par clone).
 */
export function buildCommitPieBlock(
  activity: SprintCodeActivity,
  sprintStart: string | null
): string {
  const { slices, total } = computeSlices(activity)

  if (slices.length === 0 || total === 0) {
    return `<div class="gov-empty">
<span class="gov-empty-icon">◔</span>
<span>Activité des dépôts non mesurée</span>
<span class="gov-empty-hint">Activez « une slide par user story » pour compter les commits du sprint</span>
</div>`
  }

  const legend = slices
    .map((s, i) => {
      const pct = Math.round((s.commits / total) * 100)
      return `<span class="pie-legend-item"><span class="pie-dot pie-c${i % PIE_COLORS.length}"></span>${esc(s.repoName)} — <strong>${s.commits}</strong> commit${s.commits > 1 ? 's' : ''} (${pct}%)</span>`
    })
    .join('\n')

  const since = sprintStart ? sprintStart.slice(0, 10) : null

  // Compteurs complémentaires : branches nées pendant le sprint et lignes
  // implémentées (additions), agrégés sur tous les dépôts scannés.
  const stats = activity.repoSprintStats ?? []
  let chips = ''
  if (stats.length > 0) {
    const newBranches = stats.reduce(
      (sum, s) => sum + s.activeBranches.filter((b) => b.isNew).length,
      0
    )
    const additions = stats.reduce((sum, s) => sum + s.additions, 0)
    chips = `

<div class="effort-bar">
<span class="effort-chip"><strong>${newBranches}</strong> branche${newBranches > 1 ? 's' : ''} créée${newBranches > 1 ? 's' : ''}</span>
<span class="effort-chip"><strong>+${compact(additions)}</strong> lignes implémentées</span>
</div>`
  }

  return `<div class="pie-wrap">
<div class="pie-figure">
<div class="pie-chart"></div>
<div class="pie-hole"><span class="pie-total">${compact(total)}</span><span class="pie-total-label">commits</span></div>
</div>
<div class="pie-legend">
${legend}
</div>
</div>
<div class="pie-caption">${since ? `Commits par dépôt depuis le ${since}` : 'Commits par dépôt sur la période'} — toutes branches</div>${chips}`
}
