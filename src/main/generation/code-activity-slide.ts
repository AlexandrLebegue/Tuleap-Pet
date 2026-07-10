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

/** État de la branche vs branche par défaut — dispo seulement en scan par clone. */
function branchState(b: { ahead?: number | null; behind?: number | null }): string {
  if (b.ahead === null || b.ahead === undefined) return 'N/D'
  if (b.ahead === 0 && (b.behind ?? 0) === 0)
    return '<span class="tag tag-green">Fusionnée / à jour</span>'
  const behind = b.behind !== null && b.behind !== undefined ? ` ↓${b.behind}` : ''
  const tag = (b.behind ?? 0) > 0 ? 'tag-orange' : 'tag-blue'
  return `<span class="tag ${tag}">↑${b.ahead}${behind}</span>`
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

  // La colonne « État » (ahead/behind vs branche par défaut) n'a de valeur
  // que lorsque le scan par clone a tourné.
  const showState = activity.scanMethod === 'clone'
  const branchRows =
    branches.length === 0
      ? [
          showState
            ? '| - | Aucune branche liée détectée | - | - | - |'
            : '| - | Aucune branche liée détectée | - | - |'
        ]
      : branches.slice(0, MAX_BRANCH_ROWS).map((b) => {
          const arts = b.artifactIds.map((i) => `#${i}`).join(' ')
          const commit = b.lastCommitTitle ? esc(b.lastCommitTitle.slice(0, 55)) : 'N/D'
          const meta = [b.lastCommitAuthor, b.lastCommitDate ? shortDate(b.lastCommitDate) : null]
            .filter(Boolean)
            .join(', ')
          const state = showState ? ` ${branchState(b)} |` : ''
          return `| \`${esc(b.branchName)}\` | ${arts} | ${commit} | ${esc(meta) || 'N/D'} |${state}`
        })
  const branchOverflow =
    branches.length > MAX_BRANCH_ROWS
      ? `\n<small>… et ${branches.length - MAX_BRANCH_ROWS} autre(s) branche(s).</small>`
      : ''

  return `# Branches & pull requests

<div class="slide-body">

<div class="kicker">Activité code</div>

<div class="big-grid cols-3">
<div class="big-card is-primary">
<span class="big-value">${pullRequests.length}</span>
<span class="big-label">PR en cours</span>
</div>
<div class="big-card">
<span class="big-value">${branches.length}</span>
<span class="big-label">Branches liées au sprint</span>
</div>
<div class="big-card">
<span class="big-value">${activity.reposScanned}</span>
<span class="big-label">Dépôts scannés</span>
</div>
</div>

## Pull requests en cours

| PR | Titre | Branches | Auteur | Artefacts | Statut |
|---|---|---|---|---|---|
${prRows.join('\n')}
${prOverflow}

## Branches actives liées au sprint

${
  showState
    ? '| Branche | Artefacts | Dernier commit | Auteur, date | État |\n|---|---|---|---|---|'
    : '| Branche | Artefacts | Dernier commit | Auteur, date |\n|---|---|---|---|'
}
${branchRows.join('\n')}
${branchOverflow}

</div>

<div class="slide-footer">
<small>Données Git Tuleap du ${generatedAt}${showState ? ' · scan par clone : ↑avance ↓retard vs branche par défaut' : ''}</small>
</div>`
}
