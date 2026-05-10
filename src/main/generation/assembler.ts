import type { SprintReviewSlideType } from '@shared/types'
import type { SlideResult } from './slide-generator'
import type { EnrichedContext } from './enricher'

const MARP_CSS = `\
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;600;700&display=swap');

  :root {
    --color-primary: #1a365d;
    --color-accent: #2b6cb0;
    --color-success: #276749;
    --color-warning: #c05621;
    --color-danger: #c53030;
    --color-light: #edf2f7;
    --color-muted: #718096;
  }

  section {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 22px;
    background: #ffffff;
    color: #2d3748;
    padding: 0;
    line-height: 1.3;
    display: grid;
    grid-template-rows: auto 1fr auto;
    grid-template-columns: 1fr;
    overflow: hidden;
    position: relative;
  }

  section > h1 {
    margin: 0;
    padding: 22px 48px 10px 48px;
    color: var(--color-primary);
    font-weight: 700;
    font-size: 1.5em;
    border-bottom: 3px solid var(--color-accent);
    background: #ffffff;
  }

  section::after {
    font-size: 11px;
    color: var(--color-muted);
    bottom: 18px;
  }

  h2 {
    color: var(--color-accent);
    font-weight: 600;
    font-size: 1.0em;
    margin-top: 6px;
    margin-bottom: 4px;
  }

  table {
    font-size: 0.75em;
    width: 100%;
    border-collapse: collapse;
  }

  th {
    background: var(--color-primary);
    color: white;
    padding: 5px 10px;
    text-align: left;
    font-weight: 600;
  }

  td {
    padding: 4px 10px;
    border-bottom: 1px solid #e2e8f0;
  }

  tr:nth-child(even) {
    background: #f7fafc;
  }

  .tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75em;
    font-weight: 600;
  }

  .tag-green { background: #c6f6d5; color: #276749; }
  .tag-orange { background: #feebc8; color: #c05621; }
  .tag-red { background: #fed7d7; color: #c53030; }
  .tag-blue { background: #bee3f8; color: #2b6cb0; }

  .pill {
    display: inline-block;
    padding: 3px 12px;
    border-radius: 999px;
    font-size: 0.78em;
    font-weight: 600;
    line-height: 1.4;
    white-space: nowrap;
  }

  .pill-pilote    { background: #dd6b20; color: #ffffff; }
  .pill-sponsor   { background: #c53030; color: #ffffff; }
  .pill-leader    { background: #ecc94b; color: #744210; }
  .pill-programme { background: #6b46c1; color: #ffffff; }
  .pill-plateforme{ background: #2f855a; color: #ffffff; }

  .pill-scope-in  { background: #2f855a; color: #ffffff; }
  .pill-scope-out { background: #9b2c2c; color: #ffffff; }
  .pill-scope-in::before  { content: "\\2713\\00a0"; font-weight: 700; }
  .pill-scope-out::before { content: "\\2715\\00a0"; font-weight: 700; }

  .pill-group-label.is-in  { color: #276749; }
  .pill-group-label.is-out { color: #9b2c2c; }

  .pill-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 4px 0;
  }

  .pill-group-label {
    font-weight: 600;
    color: var(--color-primary);
    font-size: 0.82em;
    min-width: 96px;
  }

  .person-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin: 4px 0;
  }

  .person-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
  }

  .person-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75em;
    font-weight: 700;
    color: #ffffff;
    flex-shrink: 0;
    letter-spacing: 0.02em;
  }

  .person-avatar.is-pilote  { background: #dd6b20; }
  .person-avatar.is-sponsor { background: #c53030; }
  .person-avatar.is-leader  { background: #ecc94b; color: #744210; }

  .person-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.15;
  }

  .person-name {
    font-size: 0.82em;
    font-weight: 600;
    color: var(--color-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .person-role {
    font-size: 0.68em;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
    margin-top: 2px;
  }

  .gov-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 4px 0;
    flex: 1;
  }

  .gov-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-left: 3px solid var(--color-accent);
    border-radius: 0 6px 6px 0;
    padding: 8px 12px;
  }

  .gov-card-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .gov-icon { font-size: 1.1em; line-height: 1; }

  .gov-name {
    font-size: 0.9em;
    font-weight: 700;
    color: var(--color-primary);
  }

  .gov-meta {
    font-size: 0.74em;
    color: var(--color-muted);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .gov-meta strong { color: #2d3748; font-weight: 600; }

  .gov-empty {
    background: #f7fafc;
    border: 1px dashed #cbd5e0;
    border-radius: 6px;
    padding: 18px 14px;
    text-align: center;
    color: var(--color-muted);
    font-size: 0.8em;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    justify-content: center;
    flex: 1;
  }

  .gov-empty-icon { font-size: 1.6em; opacity: 0.55; }
  .gov-empty-hint { font-size: 0.82em; opacity: 0.75; font-style: italic; }

  .gauge-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 10px 14px;
    margin: 4px 0;
  }

  .gauge-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .gauge-title {
    font-size: 0.82em;
    font-weight: 700;
    color: var(--color-primary);
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .gauge-value {
    font-size: 1.3em;
    font-weight: 700;
    color: var(--color-primary);
    line-height: 1;
  }

  .gauge-unit {
    font-size: 0.6em;
    color: var(--color-muted);
    font-weight: 500;
    margin-left: 2px;
  }

  .gauge-bar {
    height: 6px;
    background: #edf2f7;
    border-radius: 999px;
    overflow: hidden;
    margin: 4px 0;
  }

  .gauge-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--color-accent), var(--color-primary));
    border-radius: 999px;
  }

  .gauge-stack {
    height: 12px;
    background: #edf2f7;
    border-radius: 999px;
    overflow: hidden;
    margin: 6px 0 8px 0;
    white-space: nowrap;
    font-size: 0;
    line-height: 0;
  }

  .gauge-seg {
    display: inline-block;
    height: 100%;
    vertical-align: top;
    width: 0;
  }
  .gauge-seg.is-engage   { background: #1a365d; }
  .gauge-seg.is-planifie { background: #2b6cb0; }
  .gauge-seg.is-reserve  { background: #cbd5e0; }

  .w-0{width:0%}.w-1{width:1%}.w-2{width:2%}.w-3{width:3%}.w-4{width:4%}.w-5{width:5%}.w-6{width:6%}.w-7{width:7%}.w-8{width:8%}.w-9{width:9%}.w-10{width:10%}
  .w-11{width:11%}.w-12{width:12%}.w-13{width:13%}.w-14{width:14%}.w-15{width:15%}.w-16{width:16%}.w-17{width:17%}.w-18{width:18%}.w-19{width:19%}.w-20{width:20%}
  .w-21{width:21%}.w-22{width:22%}.w-23{width:23%}.w-24{width:24%}.w-25{width:25%}.w-26{width:26%}.w-27{width:27%}.w-28{width:28%}.w-29{width:29%}.w-30{width:30%}
  .w-31{width:31%}.w-32{width:32%}.w-33{width:33%}.w-34{width:34%}.w-35{width:35%}.w-36{width:36%}.w-37{width:37%}.w-38{width:38%}.w-39{width:39%}.w-40{width:40%}
  .w-41{width:41%}.w-42{width:42%}.w-43{width:43%}.w-44{width:44%}.w-45{width:45%}.w-46{width:46%}.w-47{width:47%}.w-48{width:48%}.w-49{width:49%}.w-50{width:50%}
  .w-51{width:51%}.w-52{width:52%}.w-53{width:53%}.w-54{width:54%}.w-55{width:55%}.w-56{width:56%}.w-57{width:57%}.w-58{width:58%}.w-59{width:59%}.w-60{width:60%}
  .w-61{width:61%}.w-62{width:62%}.w-63{width:63%}.w-64{width:64%}.w-65{width:65%}.w-66{width:66%}.w-67{width:67%}.w-68{width:68%}.w-69{width:69%}.w-70{width:70%}
  .w-71{width:71%}.w-72{width:72%}.w-73{width:73%}.w-74{width:74%}.w-75{width:75%}.w-76{width:76%}.w-77{width:77%}.w-78{width:78%}.w-79{width:79%}.w-80{width:80%}
  .w-81{width:81%}.w-82{width:82%}.w-83{width:83%}.w-84{width:84%}.w-85{width:85%}.w-86{width:86%}.w-87{width:87%}.w-88{width:88%}.w-89{width:89%}.w-90{width:90%}
  .w-91{width:91%}.w-92{width:92%}.w-93{width:93%}.w-94{width:94%}.w-95{width:95%}.w-96{width:96%}.w-97{width:97%}.w-98{width:98%}.w-99{width:99%}.w-100{width:100%}

  .gauge-legend {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 0.7em;
    color: var(--color-muted);
  }

  .gauge-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .gauge-legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    display: inline-block;
  }

  .gauge-legend-dot.is-engage   { background: #1a365d; }
  .gauge-legend-dot.is-planifie { background: #2b6cb0; }
  .gauge-legend-dot.is-reserve  { background: #cbd5e0; }

  .gauge-legend strong { color: #2d3748; font-weight: 700; }

  .gauge-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.7em;
    color: var(--color-muted);
  }

  .gauge-meta strong { color: #2d3748; font-weight: 600; }

  .timeline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: relative;
    margin: 6px 4px 2px 4px;
    padding: 0 4px;
  }

  .timeline::before {
    content: '';
    position: absolute;
    left: 10px;
    right: 10px;
    top: 8px;
    height: 2px;
    background: #e2e8f0;
    z-index: 0;
  }

  .timeline-step {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    flex: 1;
    z-index: 1;
  }

  .timeline-step::before {
    content: '';
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-accent);
    border: 2px solid #ffffff;
    box-shadow: 0 0 0 2px var(--color-accent);
    margin-bottom: 4px;
  }

  .timeline-step.is-empty::before {
    background: #ffffff;
    box-shadow: 0 0 0 2px #cbd5e0;
  }

  .timeline-label {
    font-size: 0.64em;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
  }

  .timeline-date {
    font-size: 0.78em;
    font-weight: 700;
    color: var(--color-primary);
  }

  .meteo-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 4px 0;
  }

  .meteo-row {
    padding: 6px 12px;
    border-left: 3px solid var(--color-accent);
    background: #f7fafc;
    border-radius: 0 6px 6px 0;
  }

  .meteo-row.is-ok      { border-left-color: #38a169; }
  .meteo-row.is-warning { border-left-color: #dd6b20; }
  .meteo-row.is-danger  { border-left-color: #c53030; }

  .meteo-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .meteo-axe {
    font-weight: 700;
    color: var(--color-primary);
    font-size: 0.84em;
  }

  .meteo-status {
    font-size: 0.68em;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .meteo-row.is-ok      .meteo-status { background: #c6f6d5; color: #276749; }
  .meteo-row.is-warning .meteo-status { background: #feebc8; color: #9c4221; }
  .meteo-row.is-danger  .meteo-status { background: #fed7d7; color: #9b2c2c; }

  .meteo-comment {
    color: #4a5568;
    font-size: 0.74em;
    line-height: 1.3;
    margin-top: 1px;
  }

  .ecarts-list {
    list-style: none;
    padding: 0;
    margin: 4px 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ecarts-list li {
    position: relative;
    padding: 5px 10px 5px 28px;
    background: #fff5eb;
    border-radius: 4px;
    font-size: 0.76em;
    line-height: 1.35;
    color: #2d3748;
  }

  .ecarts-list li::before {
    content: "\\26A0";
    position: absolute;
    left: 9px;
    top: 4px;
    color: var(--color-warning);
    font-size: 0.95em;
    font-weight: 700;
  }

  .stat-bar {
    display: flex;
    background: var(--color-light);
    border-left: 4px solid var(--color-accent);
    border-radius: 0 6px 6px 0;
    margin: 6px 0;
    overflow: hidden;
  }

  .stat-bar .stat-item {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    position: relative;
  }

  .stat-bar .stat-item + .stat-item::before {
    content: '';
    position: absolute;
    left: 0;
    top: 22%;
    bottom: 22%;
    width: 1px;
    background: #cbd5e0;
  }

  .stat-bar .stat-icon { font-size: 1.4em; line-height: 1; }

  .stat-bar .stat-text { display: flex; flex-direction: column; line-height: 1.15; }

  .stat-bar .stat-value {
    font-size: 1.1em;
    font-weight: 700;
    color: var(--color-primary);
  }

  .stat-bar .stat-unit {
    font-size: 0.7em;
    color: var(--color-muted);
    font-weight: 500;
    margin-left: 2px;
  }

  .stat-bar .stat-label {
    font-size: 0.68em;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
  }

  .task-section { margin: 6px 0 2px 0; }

  .task-section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin: 4px 0 4px 0;
    padding-bottom: 3px;
    border-bottom: 1px solid #e2e8f0;
  }

  .task-section-head h2 {
    margin: 0;
    color: var(--color-accent);
    font-weight: 600;
    font-size: 0.95em;
  }

  .task-section-meta {
    font-size: 0.7em;
    color: var(--color-muted);
    font-weight: 500;
    white-space: nowrap;
  }

  .task-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .task-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-left: 3px solid var(--color-accent);
    border-radius: 0 5px 5px 0;
    font-size: 0.72em;
    min-width: 0;
  }

  .task-card.is-done    { border-left-color: var(--color-success); }
  .task-card.is-encours { border-left-color: var(--color-warning); }
  .task-card.is-retard  { border-left-color: var(--color-danger); }
  .task-card.is-avenir  { border-left-color: var(--color-accent); }

  .task-card-head {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .task-card-type { font-size: 1.05em; line-height: 1; flex-shrink: 0; }

  .task-card-title {
    font-weight: 600;
    color: var(--color-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .task-card-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .task-card-meta .tag {
    font-size: 0.85em;
    padding: 1px 6px;
  }

  .task-card-owner {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--color-muted);
    font-size: 0.9em;
  }

  .task-card-avatar {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.6em;
    font-weight: 700;
    color: #ffffff;
    background: var(--color-accent);
  }

  .task-card-bar {
    height: 5px;
    background: #e2e8f0;
    border-radius: 3px;
    overflow: hidden;
    font-size: 0;
    line-height: 0;
  }

  .task-card-bar-fill {
    display: inline-block;
    height: 100%;
    background: var(--color-accent);
    vertical-align: top;
    width: 0;
  }

  .task-card.is-done    .task-card-bar-fill { background: var(--color-success); }
  .task-card.is-encours .task-card-bar-fill { background: var(--color-warning); }
  .task-card.is-retard  .task-card-bar-fill { background: var(--color-danger); }

  .task-card-effort {
    display: flex;
    justify-content: space-between;
    font-size: 0.85em;
    color: var(--color-muted);
  }

  .task-card-effort strong { color: var(--color-primary); font-weight: 600; }

  .columns { display: flex; gap: 24px; }
  .col { flex: 1; }

  .kpi-card {
    background: var(--color-light);
    border-left: 4px solid var(--color-accent);
    padding: 8px 14px;
    margin: 6px 0;
    font-size: 0.82em;
    border-radius: 0 4px 4px 0;
  }

  .kpi-card strong { color: var(--color-primary); }

  .kpi-card.warning { border-left-color: var(--color-warning); }
  .kpi-card.danger { border-left-color: var(--color-danger); }
  .kpi-card.success { border-left-color: var(--color-success); }

  .slide-body {
    padding: 14px 48px 10px 48px;
    overflow: hidden;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: 10px;
  }

  .slide-body .columns {
    flex: 1;
    align-items: stretch;
  }

  .slide-body .col {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .slide-footer {
    position: relative;
    padding: 8px 48px 14px 48px;
    border-top: 1px solid #e2e8f0;
    color: var(--color-muted);
    font-size: 12px;
  }

  .slide-footer small {
    font-size: 12px;
    color: var(--color-muted);
  }

  .slide-footer::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 5px;
    background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
  }

  .footer-bar { display: none; }

  small { color: var(--color-muted); font-size: 0.7em; }

  blockquote {
    border-left: 4px solid var(--color-accent);
    background: #f7fafc;
    padding: 8px 14px;
    margin: 6px 0;
    font-size: 0.85em;
    color: #2d3748;
  }

  p { margin: 4px 0; }
  ul, ol { margin: 4px 0; padding-left: 20px; }
  li { margin: 2px 0; }
`

function buildFrontmatter(ctx: EnrichedContext): string {
  const footer = `Sprint Review — ${ctx.label} — ${ctx.generatedAt}`
  return `---
marp: true
theme: default
paginate: true
size: 16:9
footer: '${footer}'
style: |
${MARP_CSS.split('\n').map((l) => (l.trim() ? `  ${l}` : '')).join('\n')}
---`
}

export function assembleSlides(
  results: SlideResult[],
  ctx: EnrichedContext
): { markdown: string; warnings: { slide: SprintReviewSlideType; warning: string }[] } {
  const warnings: { slide: SprintReviewSlideType; warning: string }[] = []
  const slideBlocks: string[] = []

  for (const r of results) {
    if (!r.ok) {
      warnings.push({ slide: r.type, warning: `Génération échouée : ${r.error}` })
      continue
    }
    for (const w of r.warnings) {
      warnings.push({ slide: r.type, warning: `Placeholder non remplacé : ${w}` })
    }
    slideBlocks.push(r.markdown)
  }

  const frontmatter = buildFrontmatter(ctx)
  const body = slideBlocks.join('\n\n---\n\n')
  const markdown = `${frontmatter}\n\n${body}`

  return { markdown, warnings }
}
