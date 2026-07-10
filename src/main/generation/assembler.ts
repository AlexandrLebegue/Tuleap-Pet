import type { SprintReviewSlideType } from '@shared/types'
import type { SlideResult } from './slide-generator'
import type { EnrichedContext } from './enricher'
import { buildCommitPieCss } from './commit-pie'

const MARP_CSS = `\
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;600;700&display=swap');

  :root {
    /* Palette pilotée par le thème (clair par défaut, surchargée en sombre). */
    --c-bg: #ffffff;
    --c-solid: #ffffff;
    --c-fg: #2d3748;
    --c-fg-soft: #4a5568;
    --c-heading: #1a365d;
    --c-accent: #2b6cb0;
    --c-muted: #718096;
    --c-border: #e2e8f0;
    --c-border2: #cbd5e0;
    --c-soft: #f7fafc;
    --c-soft2: #edf2f7;
    --c-card: #ffffff;
    --c-thead-bg: #1a365d;
    --c-thead-fg: #ffffff;
    --c-warn-soft: #fff5eb;
    --tag-green-bg: #c6f6d5;
    --tag-green-fg: #276749;
    --tag-orange-bg: #feebc8;
    --tag-orange-fg: #c05621;
    --tag-red-bg: #fed7d7;
    --tag-red-fg: #c53030;
    --tag-blue-bg: #bee3f8;
    --tag-blue-fg: #2c5f8f;

    /* Alias historiques utilisés dans le reste du thème. */
    --color-primary: var(--c-heading);
    --color-accent: var(--c-accent);
    --color-success: #276749;
    --color-warning: #c05621;
    --color-danger: #c53030;
    --color-light: var(--c-soft2);
    --color-muted: var(--c-muted);
  }

  section {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 22px;
    background: var(--c-bg);
    color: var(--c-fg);
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
    padding: 24px 48px 12px 48px;
    color: var(--c-heading);
    font-weight: 700;
    font-size: 1.42em;
    letter-spacing: -0.015em;
    border-bottom: 1px solid var(--c-border);
    background:
      linear-gradient(90deg, var(--c-accent), var(--c-accent)) no-repeat 48px 100% / 64px 3px;
  }

  .kicker,
  .repo-kicker {
    font-size: 0.56em;
    text-transform: uppercase;
    letter-spacing: 0.24em;
    color: var(--c-accent);
    font-weight: 700;
    margin: -2px 0 4px 0;
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
    background: var(--c-thead-bg);
    color: var(--c-thead-fg);
    padding: 5px 10px;
    text-align: left;
    font-weight: 600;
  }

  td {
    padding: 4px 10px;
    border-bottom: 1px solid var(--c-border);
  }

  tr:nth-child(even) {
    background: var(--c-soft);
  }

  .tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75em;
    font-weight: 600;
  }

  .tag-green { background: var(--tag-green-bg); color: var(--tag-green-fg); }
  .tag-orange { background: var(--tag-orange-bg); color: var(--tag-orange-fg); }
  .tag-red { background: var(--tag-red-bg); color: var(--tag-red-fg); }
  .tag-blue { background: var(--tag-blue-bg); color: var(--tag-blue-fg); }

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
    background: var(--c-card);
    border: 1px solid var(--c-border);
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
    background: var(--c-card);
    border: 1px solid var(--c-border);
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

  .gov-meta strong { color: var(--c-fg); font-weight: 600; }

  .gov-empty {
    background: var(--c-soft);
    border: 1px dashed var(--c-border2);
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

  .ref-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 4px 0;
  }

  /* Donut « commits par dépôt » : le gradient est injecté dans ce thème par
     l'assembleur (règle .pie-chart dynamique), le HTML ne porte que des classes. */
  .pie-wrap {
    display: flex;
    align-items: center;
    gap: 22px;
    padding: 8px 4px;
    margin: 4px 0;
  }

  .pie-figure {
    position: relative;
    width: 150px;
    height: 150px;
    flex-shrink: 0;
  }

  .pie-chart {
    width: 150px;
    height: 150px;
    border-radius: 50%;
    background: var(--c-soft2);
  }

  .pie-hole {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 92px;
    height: 92px;
    border-radius: 50%;
    background: var(--c-solid);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    line-height: 1.05;
  }

  .pie-total {
    font-size: 1.5em;
    font-weight: 600;
    color: var(--color-primary);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .pie-total-label {
    font-size: 0.55em;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-weight: 600;
  }

  .pie-legend {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.76em;
    color: var(--c-fg);
    min-width: 0;
  }

  .pie-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pie-legend-item strong { color: var(--color-primary); font-weight: 700; }

  .pie-dot {
    width: 11px;
    height: 11px;
    border-radius: 3px;
    display: inline-block;
    flex-shrink: 0;
    background: var(--c-border2);
  }

  .pie-c0 { background: #1a365d; }
  .pie-c1 { background: #2b6cb0; }
  .pie-c2 { background: #63b3ed; }
  .pie-c3 { background: #2f855a; }
  .pie-c4 { background: #dd6b20; }
  .pie-c5 { background: #805ad5; }
  .pie-c6 { background: #718096; }

  .pie-caption {
    font-size: 0.68em;
    color: var(--color-muted);
    margin-top: 2px;
    letter-spacing: 0.01em;
  }

  /* Bandeau « gros chiffres » façon keynote : typographie nue, filets fins,
     un seul accent de couleur sur la métrique principale. */
  .big-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0 26px;
    margin: 8px 0 14px 0;
  }

  .big-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
  .big-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }

  /* Slide de titre : hero centré (classes uniquement, jamais de style inline). */
  .title-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 22px;
    text-align: center;
  }

  .title-project {
    font-size: 1.3em;
    font-weight: 700;
    color: var(--c-heading);
    letter-spacing: -0.01em;
  }

  .title-metrics {
    width: 72%;
    margin: 0 auto;
  }

  .title-metrics .big-card { align-items: center; }

  .title-dates {
    font-size: 0.82em;
    color: var(--c-muted);
    letter-spacing: 0.02em;
  }

  .big-card {
    display: flex;
    flex-direction: column;
    gap: 3px;
    border-top: 1px solid var(--c-border2);
    padding: 10px 0 2px 0;
  }

  .big-card.is-primary {
    border-top: 3px solid var(--color-primary);
    padding-top: 8px;
  }

  .big-value {
    font-size: 2.5em;
    font-weight: 300;
    color: var(--c-fg);
    line-height: 1;
    letter-spacing: -0.03em;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .big-card.is-primary .big-value {
    color: var(--color-primary);
    font-weight: 600;
  }

  .big-label {
    font-size: 0.58em;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.09em;
    font-weight: 600;
    line-height: 1.25;
  }

  /* ── Slides « dépôt Git » : chapitres sombres ─────────────────────────
     Appliqué via la directive de classe « repo » posée sur la slide. */

  section.repo {
    background: linear-gradient(135deg, #0b1e38 0%, #1a365d 62%, #24507f 100%);
    color: #e2e8f0;
  }

  section.repo::before {
    content: '';
    position: absolute;
    right: -140px;
    top: -140px;
    width: 460px;
    height: 460px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(99, 179, 237, 0.22) 0%, rgba(99, 179, 237, 0) 70%);
    pointer-events: none;
  }

  section.repo::after { color: rgba(226, 232, 240, 0.55); }

  section.repo > h1 {
    background: transparent;
    color: #ffffff;
    border-bottom: none;
    font-family: ui-monospace, monospace;
    font-size: 1.7em;
    letter-spacing: -0.01em;
    padding-bottom: 0;
  }

  section.repo h2 {
    color: #90cdf4;
    text-transform: uppercase;
    font-size: 0.72em;
    letter-spacing: 0.14em;
    font-weight: 600;
    margin-top: 14px;
  }

  section.repo .slide-footer {
    border-top: 1px solid rgba(226, 232, 240, 0.15);
  }

  section.repo .slide-footer small { color: rgba(226, 232, 240, 0.55); }

  section.repo code {
    background: rgba(255, 255, 255, 0.1);
    color: #90cdf4;
  }

  section.repo ul, section.repo li { color: #dbe7f5; }

  .repo-kicker {
    font-size: 0.6em;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: #90cdf4;
    font-weight: 600;
    margin: -4px 0 4px 0;
  }

  section.repo .big-card { border-top: 1px solid rgba(226, 232, 240, 0.22); }
  section.repo .big-card.is-primary { border-top: 3px solid #63b3ed; }
  section.repo .big-value { color: #f7fafc; }
  section.repo .big-card.is-primary .big-value { color: #90cdf4; }
  section.repo .big-label { color: rgba(226, 232, 240, 0.6); }

  /* Graphique en barres « commits par branche » (largeurs via w-0…w-100). */
  .bars {
    display: flex;
    flex-direction: column;
    gap: 11px;
    margin-top: 8px;
  }

  .bar-row {
    display: grid;
    grid-template-columns: 300px 1fr 56px;
    align-items: center;
    gap: 16px;
  }

  .bar-name {
    font-family: ui-monospace, monospace;
    font-size: 0.7em;
    color: #cbd5e0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .bar-track {
    display: block;
    height: 13px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    overflow: hidden;
    font-size: 0;
    line-height: 0;
  }

  .bar-fill {
    display: inline-block;
    height: 100%;
    border-radius: 999px;
    vertical-align: top;
    background: linear-gradient(90deg, #2b6cb0, #63b3ed);
    box-shadow: 0 0 14px rgba(99, 179, 237, 0.35);
  }

  .bar-fill.is-new {
    background: linear-gradient(90deg, #2f855a, #68d391);
    box-shadow: 0 0 14px rgba(104, 211, 145, 0.3);
  }

  .bar-value {
    text-align: right;
    font-weight: 600;
    font-size: 1.05em;
    color: #f7fafc;
    font-variant-numeric: tabular-nums;
  }

  .bar-badge {
    display: inline-block;
    border: 1px solid #68d391;
    color: #9ae6b4;
    border-radius: 3px;
    padding: 0 6px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.82em;
    flex-shrink: 0;
  }

  .bar-badge.is-def {
    border-color: rgba(226, 232, 240, 0.4);
    color: rgba(226, 232, 240, 0.7);
  }

  .bar-more {
    font-size: 0.66em;
    color: rgba(226, 232, 240, 0.55);
    font-style: italic;
  }

  /* Densité adaptative des slides US détaillées : le contenu long réduit la
     taille de base pour rester dans le cadre 16:9. */
  section.dense  { font-size: 18.5px; }
  section.xdense { font-size: 16.5px; }

  .effort-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 4px 0;
  }

  .effort-chip {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    background: var(--c-card);
    border: 1px solid var(--c-border);
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 0.72em;
    color: var(--color-muted);
  }

  .effort-chip strong { font-size: 1.25em; color: var(--color-primary); font-weight: 700; }

  .gauge-card {
    background: var(--c-card);
    border: 1px solid var(--c-border);
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
    background: var(--c-soft2);
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
    background: var(--c-soft2);
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
  .gauge-seg.is-reserve  { background: var(--c-border2); }

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
  .gauge-legend-dot.is-reserve  { background: var(--c-border2); }

  .gauge-legend strong { color: var(--c-fg); font-weight: 700; }

  .gauge-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.7em;
    color: var(--color-muted);
  }

  .gauge-meta strong { color: var(--c-fg); font-weight: 600; }

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
    background: var(--c-border);
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
    border: 2px solid var(--c-solid);
    box-shadow: 0 0 0 2px var(--color-accent);
    margin-bottom: 4px;
  }

  .timeline-step.is-empty::before {
    background: var(--c-card);
    box-shadow: 0 0 0 2px var(--c-border2);
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
    background: var(--c-soft);
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

  .meteo-row.is-ok      .meteo-status { background: var(--tag-green-bg); color: var(--tag-green-fg); }
  .meteo-row.is-warning .meteo-status { background: var(--tag-orange-bg); color: var(--tag-orange-fg); }
  .meteo-row.is-danger  .meteo-status { background: var(--tag-red-bg); color: var(--tag-red-fg); }

  .meteo-comment {
    color: var(--c-fg-soft);
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
    background: var(--c-warn-soft);
    border-radius: 4px;
    font-size: 0.76em;
    line-height: 1.35;
    color: var(--c-fg);
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
    background: var(--c-border2);
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
    border-bottom: 1px solid var(--c-border);
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
    background: var(--c-card);
    border: 1px solid var(--c-border);
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
    background: var(--c-border);
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
    border-top: 1px solid var(--c-border);
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
    background: var(--c-soft);
    padding: 8px 14px;
    margin: 6px 0;
    font-size: 0.85em;
    color: var(--c-fg);
  }

  p { margin: 4px 0; }
  ul, ol { margin: 4px 0; padding-left: 20px; }
  li { margin: 2px 0; }
`

/** Surcharge « thème sombre » : redéfinit la palette, le reste du CSS suit. */
const DARK_CSS = `\
  :root {
    --c-bg: #0e1b2f;
    --c-solid: #0e1b2f;
    --c-fg: #d6e0ee;
    --c-fg-soft: #b9c7da;
    --c-heading: #eef4fb;
    --c-accent: #7cb1e6;
    --c-muted: #8ba1bc;
    --c-border: rgba(255, 255, 255, 0.13);
    --c-border2: rgba(255, 255, 255, 0.28);
    --c-soft: rgba(255, 255, 255, 0.05);
    --c-soft2: rgba(255, 255, 255, 0.09);
    --c-card: #152840;
    --c-thead-bg: #274769;
    --c-thead-fg: #eaf2fb;
    --c-warn-soft: rgba(237, 137, 54, 0.14);
    --tag-green-bg: rgba(104, 211, 145, 0.16);
    --tag-green-fg: #9ae6b4;
    --tag-orange-bg: rgba(246, 173, 85, 0.16);
    --tag-orange-fg: #fbd38d;
    --tag-red-bg: rgba(252, 129, 129, 0.16);
    --tag-red-fg: #feb2b2;
    --tag-blue-bg: rgba(99, 179, 237, 0.16);
    --tag-blue-fg: #90cdf4;
  }

  section {
    background: linear-gradient(160deg, #0c1830 0%, #12233e 100%);
  }

  .gauge-seg.is-engage, .gauge-legend-dot.is-engage { background: #90cdf4; }
  .gauge-seg.is-planifie, .gauge-legend-dot.is-planifie { background: #4299e1; }
  .gauge-seg.is-reserve, .gauge-legend-dot.is-reserve { background: rgba(255, 255, 255, 0.25); }
  .gauge-bar-fill { background: linear-gradient(90deg, #4299e1, #90cdf4); }
  .task-card-bar-fill { background: #4299e1; }
  .pie-c0 { background: #90cdf4; }
  .pie-c1 { background: #4299e1; }
  .pie-c2 { background: #2b6cb0; }
  .pie-c3 { background: #68d391; }
  .pie-c4 { background: #f6ad55; }
  .pie-c5 { background: #b794f4; }
  .pie-c6 { background: #a0aec0; }
  .slide-footer::after { background: linear-gradient(90deg, #2b6cb0, #63b3ed); }
`

function buildFrontmatter(ctx: EnrichedContext): string {
  const footer = `Sprint Review — ${ctx.label} — ${ctx.generatedAt}`
  // Règles dynamiques calculées depuis les données du deck (ex : gradient du
  // donut commits par dépôt) — le CSS du thème n'est pas soumis à la
  // sanitisation HTML de Marp, contrairement aux attributs style inline.
  const dynamicCss = buildCommitPieCss(ctx.codeActivity, ctx.theme)
  const themed = ctx.theme === 'dark' ? `${MARP_CSS}\n${DARK_CSS}` : MARP_CSS
  const css = dynamicCss ? `${themed}\n  ${dynamicCss}\n` : themed
  return `---
marp: true
theme: default
paginate: true
size: 16:9
footer: '${footer}'
style: |
${css
  .split('\n')
  .map((l) => (l.trim() ? `  ${l}` : ''))
  .join('\n')}
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
