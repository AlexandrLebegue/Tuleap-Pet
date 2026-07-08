import type { SprintCodeActivity } from '@shared/types'

const MAX_PR_ROWS = 8
const MAX_BRANCH_ROWS = 7

function esc(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()
}

function shortDate(iso: string | null): string {
  if (!iso) return 'N/D'
  return iso.slice(0, 10) || 'N/D'
}

function statusTag(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('merge')) return '<span class="tag tag-green">Fusionnée</span>'
  if (s.includes('abandon') || s.includes('clos'))
    return '<span class="tag tag-red">Abandonnée</span>'
  return '<span class="tag tag-orange">En revue</span>'
}

/**
 * Slide « Activité code » : tableaux des pull requests en cours et des
 * branches liées aux artefacts du sprint. Généré 100 % en code (aucun LLM) :
 * les données viennent directement de l'API Tuleap, autant les rendre
 * fidèlement plutôt que de les faire recopier par un petit modèle.
 *
 * Retourne null quand il n'y a rien à montrer (le slide est alors omis).
 */
export function buildCodeActivitySlide(
  activity: SprintCodeActivity,
  generatedAt: string
): string | null {
  const { branches, pullRequests } = activity
  if (branches.length === 0 && pullRequests.length === 0) return null

  const prRows =
    pullRequests.length === 0
      ? ['| - | Aucune pull request en cours | - | - | - |']
      : pullRequests.slice(0, MAX_PR_ROWS).map((p) => {
          const arts = p.artifactIds.length > 0 ? p.artifactIds.map((i) => `#${i}`).join(' ') : '—'
          return `| #${p.id} | ${esc(p.title.slice(0, 60)) || 'N/D'} | \`${esc(p.sourceBranch)}\` → \`${esc(p.targetBranch)}\` | ${esc(p.creator ?? 'N/D')} | ${arts} | ${statusTag(p.status)} |`
        })
  const prOverflow =
    pullRequests.length > MAX_PR_ROWS
      ? `\n<small>… et ${pullRequests.length - MAX_PR_ROWS} autre(s) pull request(s).</small>`
      : ''

  const branchRows =
    branches.length === 0
      ? ['| - | Aucune branche liée détectée | - | - |']
      : branches.slice(0, MAX_BRANCH_ROWS).map((b) => {
          const arts = b.artifactIds.map((i) => `#${i}`).join(' ')
          const commit = b.lastCommitTitle ? esc(b.lastCommitTitle.slice(0, 55)) : 'N/D'
          const meta = [b.lastCommitAuthor, b.lastCommitDate ? shortDate(b.lastCommitDate) : null]
            .filter(Boolean)
            .join(', ')
          return `| \`${esc(b.branchName)}\` | ${arts} | ${commit} | ${esc(meta) || 'N/D'} |`
        })
  const branchOverflow =
    branches.length > MAX_BRANCH_ROWS
      ? `\n<small>… et ${branches.length - MAX_BRANCH_ROWS} autre(s) branche(s).</small>`
      : ''

  return `# 🔀 Activité code — Branches & Pull Requests

<div class="slide-body">

<div class="stat-bar">
<div class="stat-item">
<span class="stat-icon">📚</span>
<span class="stat-text">
<span class="stat-value">${activity.reposScanned}</span>
<span class="stat-label">Dépôts scannés</span>
</span>
</div>
<div class="stat-item">
<span class="stat-icon">🌿</span>
<span class="stat-text">
<span class="stat-value">${branches.length}</span>
<span class="stat-label">Branches liées</span>
</span>
</div>
<div class="stat-item">
<span class="stat-icon">🔀</span>
<span class="stat-text">
<span class="stat-value">${pullRequests.length}</span>
<span class="stat-label">PR en cours</span>
</span>
</div>
</div>

## Pull requests en cours

| PR | Titre | Branches | Auteur | Artefacts | Statut |
|---|---|---|---|---|---|
${prRows.join('\n')}
${prOverflow}

## Branches actives liées au sprint

| Branche | Artefacts | Dernier commit | Auteur, date |
|---|---|---|---|
${branchRows.join('\n')}
${branchOverflow}

</div>

<div class="slide-footer">
<small>Données Git Tuleap extraites le ${generatedAt} — généré automatiquement, sans IA</small>
</div>`
}
