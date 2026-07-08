import type { SprintCodeActivity } from '@shared/types'

/** Palette du camembert (réutilise les couleurs des tags/pills du thème). */
const PIE_COLORS = ['#2b6cb0', '#dd6b20', '#2f855a', '#6b46c1', '#c53030', '#ecc94b', '#718096']

const MAX_SLICES = 6

function esc(text: string): string {
  return text.replace(/[<>&"]/g, ' ').trim()
}

/**
 * Camembert « commits par dépôt depuis le début du sprint », rendu en HTML/CSS
 * pur (conic-gradient) — compatible Marp, aucune lib. Retourne un bloc
 * placeholder explicite quand les données ne sont pas disponibles (le
 * comptage nécessite le scan par clone).
 */
export function buildCommitPieBlock(
  activity: SprintCodeActivity,
  sprintStart: string | null
): string {
  const data = (activity.commitsByRepo ?? []).filter((r) => r.commits > 0)
  const total = data.reduce((sum, r) => sum + r.commits, 0)

  if (data.length === 0 || total === 0) {
    return `<div class="gov-empty">
<span class="gov-empty-icon">📊</span>
<span>Activité des dépôts non mesurée</span>
<span class="gov-empty-hint">Activez « une slide par user story » pour compter les commits du sprint</span>
</div>`
  }

  // Regroupe la traîne dans « Autres » au-delà de MAX_SLICES parts.
  const sorted = [...data].sort((a, b) => b.commits - a.commits)
  const head = sorted.slice(0, MAX_SLICES)
  const tail = sorted.slice(MAX_SLICES)
  const slices = [...head]
  if (tail.length > 0) {
    slices.push({
      repoName: `Autres (${tail.length})`,
      commits: tail.reduce((s, r) => s + r.commits, 0)
    })
  }

  const stops: string[] = []
  const legend: string[] = []
  let acc = 0
  slices.forEach((s, i) => {
    const color = PIE_COLORS[i % PIE_COLORS.length]
    const from = (acc / total) * 100
    acc += s.commits
    const to = (acc / total) * 100
    stops.push(`${color} ${from.toFixed(1)}% ${to.toFixed(1)}%`)
    const pct = Math.round((s.commits / total) * 100)
    legend.push(
      `<span class="pie-legend-item"><span class="pie-dot" style="background:${color}"></span>${esc(s.repoName)} — <strong>${s.commits}</strong> commit${s.commits > 1 ? 's' : ''} (${pct}%)</span>`
    )
  })

  const since = sprintStart ? sprintStart.slice(0, 10) : null

  return `<div class="pie-wrap">
<div class="pie-chart" style="background: conic-gradient(${stops.join(', ')})"></div>
<div class="pie-legend">
${legend.join('\n')}
</div>
</div>
<div class="pie-caption"><strong>${total}</strong> commit${total > 1 ? 's' : ''}${since ? ` depuis le ${since}` : ' sur la période'} — toutes branches confondues</div>`
}
