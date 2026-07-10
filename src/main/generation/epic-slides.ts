import { bucketArtifacts } from '../prompts/sprint-review'
import type { EnrichedContext, EpicInfo } from './enricher'
import { esc, statusTag, refBadgesHtml, extractEffortChips } from './us-slides'

const EPIC_STORIES_CAP = 8

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function widthClass(pct: number): string {
  return `w-${Math.max(0, Math.min(100, Math.round(pct)))}`
}

function buildOneEpicSlide(epic: EpicInfo, ctx: EnrichedContext): string {
  const byId = new Map(ctx.detailedArtifacts.map((a) => [a.id, a]))
  const summaryById = new Map(ctx.artifacts.map((a) => [a.id, a]))

  // US du sprint rattachées à cet epic, avec leur meilleur statut connu.
  const stories = epic.storyIds
    .map((id) => byId.get(id) ?? summaryById.get(id))
    .filter((a): a is NonNullable<typeof a> => !!a)

  const buckets = bucketArtifacts(stories)
  const total = stories.length
  const done = buckets.done.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const detail = epic.detail
  const description = detail.description ? stripHtml(detail.description) : null

  const introBlocks: string[] = []
  if (description) {
    introBlocks.push(description.slice(0, 300))
  }
  const effortChips = extractEffortChips(detail)
  const refsHtml = refBadgesHtml(detail.crossReferences ?? [])

  const storyRows = stories.slice(0, EPIC_STORIES_CAP).map((s) => {
    const stats = ctx.childrenByParent.get(s.id)?.length ?? 0
    const tasksDone = (ctx.childrenByParent.get(s.id) ?? [])
      .map((id) => byId.get(id))
      .filter((t) => t && bucketArtifacts([t]).done.length > 0).length
    const tasks = stats > 0 ? `${tasksDone}/${stats}` : '—'
    return `| #${s.id} | ${esc(s.title || '(sans titre)').slice(0, 55)} | ${statusTag(s.status)} | ${tasks} |`
  })
  const overflow =
    stories.length > EPIC_STORIES_CAP
      ? `\n<small>… et ${stories.length - EPIC_STORIES_CAP} autre(s) user stories.</small>`
      : ''

  const gauge = `<div class="gauge-card">
<div class="gauge-head"><span class="gauge-title">Avancement dans ce sprint</span><span class="gauge-value">${pct}<span class="gauge-unit">%</span></span></div>
<div class="gauge-bar"><div class="gauge-bar-fill ${widthClass(pct)}"></div></div>
<div class="gauge-meta"><span>${done} terminée${done > 1 ? 's' : ''} / ${total} US</span><strong>${buckets.inProgress.length} en cours · ${buckets.todo.length} à venir</strong></div>
</div>`

  const leftBlocks = [
    ...introBlocks,
    gauge,
    ...(effortChips.length > 0
      ? [
          `<div class="effort-bar">\n${effortChips
            .map(
              (c) =>
                `<span class="effort-chip"><strong>${Number.isInteger(c.value) ? c.value : c.value.toFixed(1)}</strong> ${c.unit} · ${esc(c.label)}</span>`
            )
            .join('\n')}\n</div>`
        ]
      : []),
    ...(refsHtml ? [`## Références\n\n${refsHtml}`] : [])
  ]

  return `# Epic #${detail.id} — ${esc(detail.title || '(sans titre)').slice(0, 65)}

<div class="slide-body">

<div class="kicker">Epic</div>

<div class="columns">
<div class="col">

${leftBlocks.join('\n\n')}

</div>
<div class="col">

## User stories du sprint (${total})

| # | User story | Statut | Tâches |
|---|---|---|---|
${storyRows.join('\n')}
${overflow}

<div class="kpi-card">
<strong>Statut epic :</strong> ${statusTag(detail.status)}${epic.trackerLabel ? ` · <strong>Tracker :</strong> ${esc(epic.trackerLabel)}` : ''}
</div>

</div>
</div>

</div>

<div class="slide-footer">
<small>Epic #${detail.id} — avancement basé sur les ${total} US de ce sprint · données Tuleap du ${ctx.generatedAt}</small>
</div>`
}

/**
 * Slides « une par epic » : pour chaque epic parent d'US du sprint, montre
 * l'avancement (US du sprint terminées / totales, jauge), la liste des US
 * rattachées avec statut et tâches, la description et les références.
 * 100 % déterministe — aucun appel LLM.
 */
export function buildEpicSlides(ctx: EnrichedContext): string[] {
  return ctx.epics.filter((e) => e.storyIds.length > 0).map((e) => buildOneEpicSlide(e, ctx))
}
