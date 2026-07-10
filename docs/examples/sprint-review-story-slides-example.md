---
marp: true
theme: default
paginate: true
size: 16:9
footer: 'Sprint Review — Sprint 24.07 — 2026-07-10'
style: |
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
    .pill-scope-in::before  { content: "\2713\00a0"; font-weight: 700; }
    .pill-scope-out::before { content: "\2715\00a0"; font-weight: 700; }

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
      content: "\26A0";
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

    .pie-chart { background: conic-gradient(#1a365d 0.0% 100.0%); }

---

# Sprint Review — Sprint 24.07

<div class="slide-body">

<div class="kicker">Portail Audit</div>

## Portail Audit

**Période :** 2026-06-23 → 2026-07-07

**Statut :** Ouvert — 4 artefacts (1 terminé, 2 en cours, 1 à venir)

</div>

<div class="slide-footer">
<small>Présentation générée le 2026-07-08 — Données Tuleap</small>
</div>

---

# Sprint 24.07 — Contexte & Objectif

<div class="slide-body">

<div class="kicker">Cadrage</div>

## Objectif du sprint

> Livrer l'export PDF des rapports d'audit et finaliser l'authentification SSO, tout en corrigeant le crash du dashboard.

## Périmètre

- US #1201 — Export PDF des rapports d'audit
- US #1202 — Authentification SSO (SAML)
- Bug #1203 — Crash à l'ouverture du dashboard
- US #1204 — Notifications e-mail configurables

</div>

<div class="slide-footer">
<small>Données au 2026-07-08</small>
</div>

---

# Récapitulatif des user stories

<div class="slide-body">

<div class="kicker">Backlog du sprint</div>

<div class="big-grid cols-4">
<div class="big-card is-primary">
<span class="big-value">4</span>
<span class="big-label">User stories</span>
</div>
<div class="big-card">
<span class="big-value">1</span>
<span class="big-label">Terminées</span>
</div>
<div class="big-card">
<span class="big-value">2</span>
<span class="big-label">En cours</span>
</div>
<div class="big-card">
<span class="big-value">1</span>
<span class="big-label">À venir</span>
</div>
</div>

| US | Titre | Statut | Description | Tâches | Code |
|---|---|---|---|---|---|
| #1201 | US — Export PDF des rapports d’audit | <span class="tag tag-orange">En cours</span> | En tant qu’auditeur, je veux exporter mes rapports en PDF afin de les archiver. | 1/2 | <span class="tag tag-green">br</span> <span class="tag tag-orange">PR</span> |
| #1202 | US — Authentification SSO (SAML) | <span class="tag tag-green">Terminé</span> | — | 1/1 | — |
| #1203 | Bug — Crash à l’ouverture du dashboard | <span class="tag tag-orange">En cours</span> | — | — | <span class="tag tag-green">br</span> <span class="tag tag-orange">PR</span> |
| #1204 | US — Notifications e-mail configurables | <span class="tag tag-blue">À faire</span> | — | — | — |

</div>

<div class="slide-footer">
<small>Données Tuleap du 2026-07-10 · br = branche liée · PR = pull request en cours</small>
</div>

---

# Epic #1100 — Epic — Dématérialisation des rapports d’audit

<div class="slide-body">

<div class="kicker">Epic</div>

<div class="columns">
<div class="col">

Supprimer le papier du processus d’audit : génération, export et archivage numérique des rapports.

<div class="gauge-card">
<div class="gauge-head"><span class="gauge-title">Avancement dans ce sprint</span><span class="gauge-value">0<span class="gauge-unit">%</span></span></div>
<div class="gauge-bar"><div class="gauge-bar-fill w-0"></div></div>
<div class="gauge-meta"><span>0 terminée / 2 US</span><strong>1 en cours · 1 à venir</strong></div>
</div>

<div class="effort-bar">
<span class="effort-chip"><strong>34</strong> pts · Points</span>
</div>

</div>
<div class="col">

## User stories du sprint (2)

| # | User story | Statut | Tâches |
|---|---|---|---|
| #1201 | US — Export PDF des rapports d’audit | <span class="tag tag-orange">En cours</span> | 1/2 |
| #1204 | US — Notifications e-mail configurables | <span class="tag tag-blue">À faire</span> | — |


<div class="kpi-card">
<strong>Statut epic :</strong> <span class="tag tag-orange">En cours</span> · <strong>Tracker :</strong> Epics
</div>

</div>
</div>

</div>

<div class="slide-footer">
<small>Epic #1100 — avancement basé sur les 2 US de ce sprint · données Tuleap du 2026-07-10</small>
</div>

---

# Équipe & Activité

<div class="slide-body">

<div class="kicker">Équipe</div>

<div class="columns">
<div class="col">

## Contributeurs du sprint

<div class="person-grid">
<div class="person-card"><span class="person-avatar is-leader">AM</span><span class="person-info"><span class="person-name">Alice Martin</span><span class="person-role">Contributeur</span></span></div>
<div class="person-card"><span class="person-avatar is-leader">BD</span><span class="person-info"><span class="person-name">Bob Durand</span><span class="person-role">Contributeur</span></span></div>
<div class="person-card"><span class="person-avatar is-leader">CP</span><span class="person-info"><span class="person-name">Chloé Petit</span><span class="person-role">Contributeur</span></span></div>
<div class="person-card"><span class="person-avatar is-leader">DR</span><span class="person-info"><span class="person-name">David Roux</span><span class="person-role">Contributeur</span></span></div>
</div>

</div>
<div class="col">

## Activité des dépôts

<div class="pie-wrap">
<div class="pie-figure">
<div class="pie-chart"></div>
<div class="pie-hole"><span class="pie-total">42</span><span class="pie-total-label">commits</span></div>
</div>
<div class="pie-legend">
<span class="pie-legend-item"><span class="pie-dot pie-c0"></span>webapp — <strong>42</strong> commits (100%)</span>
</div>
</div>
<div class="pie-caption">Commits par dépôt depuis le 2026-06-23 — toutes branches</div>

<div class="effort-bar">
<span class="effort-chip"><strong>2</strong> branches créées</span>
<span class="effort-chip"><strong>+4,2k</strong> lignes implémentées</span>
</div>

</div>
</div>

## Parties prenantes

<div class="pill-group">
<span class="pill-group-label">Equipe</span>
<span class="pill pill-leader">Alice Martin</span>
<span class="pill pill-leader">Bob Durand</span>
<span class="pill pill-leader">Chloé Petit</span>
<span class="pill pill-leader">David Roux</span>
</div>

</div>

<div class="slide-footer">
<small>Données au 2026-07-08</small>
</div>

---

# Livrables & Planning

<div class="slide-body">

<div class="kicker">Livraison</div>

<div class="columns">
<div class="col">

## Livrables du sprint

- Authentification SSO (SAML) recettée en préproduction
- Génération PDF côté serveur opérationnelle

</div>
<div class="col">

## Planning jalonné

| Jalon | Date prévue | Statut |
|---|---|---|
| Recette SSO | 2026-07-02 | <span class="tag tag-green">Terminé</span> |
| Export PDF complet | 2026-07-07 | <span class="tag tag-orange">En cours</span> |
| Fin de sprint | 2026-07-07 | <span class="tag tag-blue">A venir</span> |

</div>
</div>

</div>

<div class="slide-footer">
<small>Données au 2026-07-08</small>
</div>

---

# Avancement des travaux

<div class="slide-body">

<div class="kicker">Exécution</div>

<div class="big-grid cols-3">
<div class="big-card">
<span class="big-value">4</span>
<span class="big-label">Total items</span>
</div>
<div class="big-card">
<span class="big-value">25<span class="stat-unit">%</span></span>
<span class="big-label">Avancement</span>
</div>
<div class="big-card">
<span class="big-value">En cours de livraison</span>
<span class="big-label">Phase</span>
</div>
</div>

<div class="task-section">
<div class="task-section-head"><h2>Terminés</h2><span class="task-section-meta">1 item</span></div>
<div class="task-grid">
<div class="task-card is-done">
<div class="task-card-head"><span class="task-card-title">Authentification SSO (SAML)</span></div>
<div class="task-card-meta"><span class="tag tag-green">Terminé</span><span class="task-card-owner"><span class="task-card-avatar">BD</span></span></div>
<div class="task-card-bar"><div class="task-card-bar-fill w-100"></div></div>
<div class="task-card-effort"><span>#1202</span><strong>100%</strong></div>
</div>
</div>
</div>

<div class="task-section">
<div class="task-section-head"><h2>En cours</h2><span class="task-section-meta">2 items</span></div>
<div class="task-grid">
<div class="task-card is-encours">
<div class="task-card-head"><span class="task-card-title">Export PDF des rapports d'audit</span></div>
<div class="task-card-meta"><span class="tag tag-orange">En cours</span><span class="task-card-owner"><span class="task-card-avatar">AM</span></span></div>
<div class="task-card-bar"><div class="task-card-bar-fill w-50"></div></div>
<div class="task-card-effort"><span>#1201</span><strong>50%</strong></div>
</div>
<div class="task-card is-encours">
<div class="task-card-head"><span class="task-card-title">Crash à l'ouverture du dashboard</span></div>
<div class="task-card-meta"><span class="tag tag-orange">En cours</span><span class="task-card-owner"><span class="task-card-avatar">CP</span></span></div>
<div class="task-card-bar"><div class="task-card-bar-fill w-50"></div></div>
<div class="task-card-effort"><span>#1203</span><strong>50%</strong></div>
</div>
</div>
</div>

<div class="task-section">
<div class="task-section-head"><h2>À venir</h2><span class="task-section-meta">1 item</span></div>
<div class="task-grid">
<div class="task-card is-avenir">
<div class="task-card-head"><span class="task-card-title">Notifications e-mail configurables</span></div>
<div class="task-card-meta"><span class="tag tag-blue">À venir</span><span class="task-card-owner"><span class="task-card-avatar">AM</span></span></div>
<div class="task-card-bar"><div class="task-card-bar-fill w-0"></div></div>
<div class="task-card-effort"><span>#1204</span><strong>0%</strong></div>
</div>
</div>
</div>

</div>

<div class="slide-footer">
<small>Données TULEAP extraites le 2026-07-08</small>
</div>

---

<!-- _class: dense -->

# US #1201 — US — Export PDF des rapports d’audit

<div class="slide-body">

<div class="kicker">User story</div>

<div class="columns">
<div class="col">

## Description

En tant qu’auditeur, je veux exporter mes rapports en PDF afin de les archiver.

## Critères d'acceptance

- Le PDF respecte le gabarit officiel
- Export en moins de 10 secondes

<div class="effort-bar">
<span class="effort-chip"><strong>8</strong> pts · Points</span>
<span class="effort-chip"><strong>12</strong> h · Effort restant</span>
</div>

- **Assigné à :** Alice Martin

## Références

<div class="ref-badges">
<span class="tag tag-orange">→ pr #77</span>
<span class="tag tag-green">← git #webapp/bbb222</span>
</div>

</div>
<div class="col">

## Tâches (1/2 terminées)

| # | Tâche | Statut |
|---|---|---|
| #1210 | Générer le PDF côté serveur (lib wkhtmltopdf) | <span class="tag tag-green">Terminé</span> |
| #1211 | Page de prévisualisation avant export | <span class="tag tag-orange">En cours</span> |

## Code

- **Branche** `feature/1201-export-pdf` (webapp) — ↑3 ↓1 vs main · « feat(export): page de prévisualisation PDF » (2026-07-04)
- **PR #77** « Export PDF des rapports (art #1201) » — feature/1201-export-pdf → main · David Roux

<div class="kpi-card">
<strong>Statut :</strong> <span class="tag tag-orange">En cours</span> · <strong>Dernière activité :</strong> 2026-07-04 par Alice Martin · <strong>Créée par :</strong> Alice Martin
</div>

<blockquote>
« PDF serveur OK, reste la prévisualisation — PR ouverte pour revue. »
</blockquote>

</div>
</div>

</div>

<div class="slide-footer">
<small>US #1201 — données Tuleap du 2026-07-10</small>
</div>

---

# US #1202 — US — Authentification SSO (SAML)

<div class="slide-body">

<div class="kicker">User story</div>

<div class="columns">
<div class="col">

<div class="effort-bar">
<span class="effort-chip"><strong>5</strong> pts · Points</span>
</div>

</div>
<div class="col">

## Tâches (1/1 terminées)

| # | Tâche | Statut |
|---|---|---|
| #1212 | Configurer le connecteur SAML côté IdP | <span class="tag tag-green">Terminé</span> |

<div class="kpi-card">
<strong>Statut :</strong> <span class="tag tag-green">Terminé</span> · <strong>Dernière activité :</strong> 2026-07-02 par Bob Durand · <strong>Créée par :</strong> Bob Durand
</div>

<blockquote>
« Recette validée en préprod, story fermée. »
</blockquote>

</div>
</div>

</div>

<div class="slide-footer">
<small>US #1202 — données Tuleap du 2026-07-10</small>
</div>

---

# US #1203 — Bug — Crash à l’ouverture du dashboard

<div class="slide-body">

<div class="kicker">User story</div>

<div class="columns">
<div class="col">

- **Sévérité :** Critique

</div>
<div class="col">

## Code

- **Branche** `fix/1203-dashboard-crash` (webapp) — fusionnée / à jour · « fix(dashboard): guard sur cache vide » (2026-07-05)
- **PR #78** « Correctif crash dashboard » — fix/1203-dashboard-crash → main · Chloé Petit

<div class="kpi-card">
<strong>Statut :</strong> <span class="tag tag-orange">En cours</span> · <strong>Dernière activité :</strong> 2026-07-05 par Chloé Petit · <strong>Créée par :</strong> Chloé Petit
</div>

<blockquote>
« Reproduit uniquement avec le cache vide — correctif en cours sur fix/1203. »
</blockquote>

</div>
</div>

</div>

<div class="slide-footer">
<small>US #1203 — données Tuleap du 2026-07-10</small>
</div>

---

# US #1204 — US — Notifications e-mail configurables

<div class="slide-body">

<div class="kicker">User story</div>



<div class="kpi-card">
<strong>Statut :</strong> <span class="tag tag-blue">À faire</span> · <strong>Dernière modification :</strong> 2026-06-22 · <strong>Créée par :</strong> Alice Martin
</div>

</div>

<div class="slide-footer">
<small>US #1204 — données Tuleap du 2026-07-10</small>
</div>

---

# Branches & pull requests

<div class="slide-body">

<div class="kicker">Activité code</div>

<div class="big-grid cols-3">
<div class="big-card is-primary">
<span class="big-value">2</span>
<span class="big-label">PR en cours</span>
</div>
<div class="big-card">
<span class="big-value">2</span>
<span class="big-label">Branches liées au sprint</span>
</div>
<div class="big-card">
<span class="big-value">1</span>
<span class="big-label">Dépôts scannés</span>
</div>
</div>

## Pull requests en cours

| PR | Titre | Branches | Auteur | Artefacts | Statut |
|---|---|---|---|---|---|
| #77 | Export PDF des rapports (art #1201) | `feature/1201-export-pdf` → `main` | David Roux | #1201 | <span class="tag tag-orange">En revue</span> |
| #78 | Correctif crash dashboard | `fix/1203-dashboard-crash` → `main` | Chloé Petit | #1203 | <span class="tag tag-orange">En revue</span> |


## Branches actives liées au sprint

| Branche | Artefacts | Dernier commit | Auteur, date | État |
|---|---|---|---|---|
| `feature/1201-export-pdf` | #1201 | feat(export): page de prévisualisation PDF | David Roux, 2026-07-04 | <span class="tag tag-orange">↑3 ↓1</span> |
| `fix/1203-dashboard-crash` | #1203 | fix(dashboard): guard sur cache vide | Chloé Petit, 2026-07-05 | <span class="tag tag-green">Fusionnée / à jour</span> |


</div>

<div class="slide-footer">
<small>Données Git Tuleap du 2026-07-10 · scan par clone : ↑avance ↓retard vs branche par défaut</small>
</div>

---

<!-- _class: repo -->

# webapp

<div class="slide-body">

<div class="repo-kicker">Activité du dépôt · depuis le 2026-06-23</div>

<div class="big-grid">
<div class="big-card is-primary">
<span class="big-value">42</span>
<span class="big-label">Commits</span>
</div>
<div class="big-card">
<span class="big-value">3</span>
<span class="big-label">Branches actives · 2 nouvelles</span>
</div>
<div class="big-card">
<span class="big-value">87</span>
<span class="big-label">Fichiers modifiés</span>
</div>
<div class="big-card">
<span class="big-value">+4,2k −1,2k</span>
<span class="big-label">Lignes ajoutées / retirées</span>
</div>
<div class="big-card">
<span class="big-value">4</span>
<span class="big-label">Contributeurs</span>
</div>
</div>

## Commits par branche

<div class="bars">
<div class="bar-row">
<span class="bar-name">main <span class="bar-badge is-def">défaut</span></span>
<span class="bar-track"><span class="bar-fill w-100"></span></span>
<span class="bar-value">25</span>
</div>
<div class="bar-row">
<span class="bar-name">feature/1201-export-pdf <span class="bar-badge">nouvelle</span></span>
<span class="bar-track"><span class="bar-fill is-new w-48"></span></span>
<span class="bar-value">12</span>
</div>
<div class="bar-row">
<span class="bar-name">fix/1203-dashboard-crash <span class="bar-badge">nouvelle</span></span>
<span class="bar-track"><span class="bar-fill is-new w-20"></span></span>
<span class="bar-value">5</span>
</div>
</div>

</div>

<div class="slide-footer">
<small>Dépôt webapp · toutes branches · analyse du clone local</small>
</div>

---

<!-- _class: repo -->

# Dépôt webapp — nouveautés du sprint

<div class="slide-body">

<div class="columns">
<div class="col">

## Nouvelles fonctionnalités

- Prévisualisation des rapports PDF avant export
- Génération des PDF côté serveur

</div>
<div class="col">

## Correctifs & améliorations

- Crash du dashboard corrigé (cache vide)
- Dépendances mises à jour

</div>
</div>

## Zones du code les plus actives

- `src/pdf/` — moteur de génération PDF largement remanié
- `src/dashboard/` — robustesse du cache

</div>

<div class="slide-footer">
<small>Dépôt webapp · analyse des 42 commits du sprint · données au 2026-07-08</small>
</div>

---

# Indicateurs clés du sprint

<div class="slide-body">

<div class="kicker">Pilotage</div>

<div class="gauge-card">
<div class="gauge-head"><span class="gauge-title">Avancement global</span><span class="gauge-value">25<span class="gauge-unit">%</span></span></div>
<div class="gauge-bar"><div class="gauge-bar-fill w-25"></div></div>
<div class="gauge-meta"><span>1 terminé / 4 items</span><strong>2 en cours</strong></div>
</div>

<div class="kpi-card success"><strong>SSO livré</strong> — recette préprod validée le 2026-07-02</div>
<div class="kpi-card warning"><strong>2 PR en attente</strong> — PR #77 et PR #78 à faire relire</div>
<div class="kpi-card"><strong>Activité code</strong> — 2 branches actives liées au sprint</div>

</div>

<div class="slide-footer">
<small>Données au 2026-07-08</small>
</div>

---

# Risques & Contraintes

<div class="slide-body">

<div class="kicker">Vigilance</div>

<div class="columns">
<div class="col">

## Risques identifiés

| # | Risque | Prob. | Impact | Criticité | Mitigation |
|---|---|---|---|---|---|
| 1204 | Story non démarrée, sans branche | Moyenne | Report | <span class="tag tag-orange">Elevee</span> | Prioriser en début de semaine |
| 77 | PR export PDF non fusionnée | Moyenne | Retard livraison | <span class="tag tag-blue">Moyenne</span> | Planifier la revue |

</div>
<div class="col">

## Contraintes actives

| # | Contrainte | Effet | Statut |
|---|---|---|---|
| 1 | Revue de code obligatoire | 2 PR en file | En cours |

## Points bloquants

| # | Description | Propriétaire | Depuis |
|---|---|---|---|
| - | Aucun bloquant identifie | - | - |

</div>
</div>

</div>

<div class="slide-footer">
<small>Données au 2026-07-08</small>
</div>

---

# Synthèse du sprint

<div class="slide-body">

<div class="kicker">Conclusion</div>

<div class="columns">
<div class="col">

## Faits marquants

<div class="kpi-card success">
<strong>SSO en production</strong> — story #1202 terminée et recettée
</div>
<div class="kpi-card warning">
<strong>2 PR à relire</strong> — export PDF et fix dashboard
</div>
<div class="kpi-card">
<strong>Sprint à 25%</strong> — 2 items en cours, 1 à venir
</div>

## Enseignements

<div class="kpi-card">
<span class="tag tag-green">Succès</span> Découpage US/tâches efficace sur l'export PDF
</div>
<div class="kpi-card">
<span class="tag tag-orange">Vigilance</span> Les revues de PR doivent être planifiées plus tôt
</div>

</div>
<div class="col">

## Conclusion

<blockquote>
Sprint en phase de livraison. Prochaine étape : fusionner les PR #77 et #78. Décision attendue : go/no-go sur le report de #1204.
</blockquote>

## Alertes

<ul class="ecarts-list">
<li>PR #77 en attente de revue depuis le 2026-07-03.</li>
<li>#1204 non démarrée à 3 jours de la fin de sprint.</li>
</ul>

</div>
</div>

</div>

<div class="slide-footer">
<small>Présentation générée le 2026-07-08 — Données Tuleap</small>
</div>