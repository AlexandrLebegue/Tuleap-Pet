// Génère les pages HTML des écrans (shell + sidebar fidèles) à capturer.
const fs = require('fs')
const path = require('path')
const OUT = path.join(__dirname, 'screens')

// --- icônes lucide (stroke 2, viewBox 24) ---
const I = {
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  kanban: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  sparkles: '<path d="M9.94 14.34A2 2 0 0 0 8.66 13L3 11l5.66-2A2 2 0 0 0 9.94 7.66L12 2l2.06 5.66A2 2 0 0 0 15.34 9L21 11l-5.66 2a2 2 0 0 0-1.28 1.34L12 20z"/>',
  git: '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  filecode: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 13-2 2 2 2M13 13l2 2-2 2"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  flask: '<path d="M10 2v7.31M14 9.3V1.99M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0M5.58 16.5h12.85"/>',
  cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2M9 2v2M15 20v2M9 20v2M20 15h2M20 9h2M2 15h2M2 9h2"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/>',
  wand: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9h0M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'
}
const icon = (n, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[n] || ''}</svg>`

const groups = [
  { label: 'Général', items: [['settings', 'Configuration', 'settings'], ['chatbot', 'Chatbot', 'message']] },
  { label: 'Projet', items: [['project', 'Projet', 'kanban']] },
  { label: 'Tuleap', items: [['sprint', 'Sprint Board', 'grid'], ['generation', 'Génération IA', 'sparkles'], ['git', 'Git Explorer', 'git']] },
  { label: 'Dev × Tuleap', items: [['ticket-branch', 'Ticket → Branche', 'rocket'], ['pr-reviewer', 'PR Reviewer', 'eye']] },
  { label: 'Codeur', items: [['coder', 'Coder', 'code'], ['commenter', 'Commentateur', 'filecode'], ['corrector', 'Correcteur', 'wrench'], ['test-generator', 'Tests unitaires', 'flask']] },
  { label: 'CI / CD', items: [['jenkins', 'Jenkins', 'cpu']] }
]

const sidebar = (active) => `
<aside class="sidebar">
  <div class="brand">
    <h1>Tuleap AI Companion</h1>
    <div class="conn"><span class="dot"></span> Connecté · tuleap.example.com</div>
    <div class="proj">Plateforme Diurne — Équipe DevOps</div>
  </div>
  <nav class="nav">
    ${groups.map(g => `<div class="nav-group"><div class="gl">${g.label}</div>
      ${g.items.map(([to, lbl, ic]) => `<div class="nav-item ${to === active ? 'active' : ''}">${icon(ic)}<span>${lbl}</span></div>`).join('')}
    </div>`).join('')}
  </nav>
  <div class="foot">v0.0.1 · Phase 0-10 · Local-first</div>
</aside>`

const page = (active, body) => `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<link rel="stylesheet" href="ui.css"></head><body>
<div class="app">${sidebar(active)}<div class="main">${body}</div></div></body></html>`

// ----------------------------------------------------------------------------
const screens = {}

// 1) Projet ------------------------------------------------------------------
screens.project = page('project', `<div class="page">
  <div class="page-head between">
    <div><h2>Projet</h2><p>Plateforme Diurne — trackers, artéfacts et détail</p></div>
    <div class="tabs"><div class="tab active">Vue tableau</div><div class="tab">Vue kanban</div></div>
  </div>
  <div class="row">
    <div class="card" style="width:240px">
      <div class="card-h">${icon('folder')} Trackers</div>
      <div class="list">
        <div class="list-row sel"><div><div class="t">User Stories</div><div class="s">128 artéfacts</div></div><span class="badge secondary">US</span></div>
        <div class="list-row"><div><div class="t">Bugs</div><div class="s">42 artéfacts</div></div><span class="badge secondary">BUG</span></div>
        <div class="list-row"><div><div class="t">Tâches</div><div class="s">301 artéfacts</div></div><span class="badge secondary">TASK</span></div>
        <div class="list-row"><div><div class="t">Épopées</div><div class="s">12 artéfacts</div></div><span class="badge secondary">EPIC</span></div>
      </div>
    </div>
    <div class="card" style="flex:1">
      <div class="card-h between"><span>${icon('kanban')} Artéfacts — User Stories</span><span class="muted" style="font-size:12px">1–6 sur 128</span></div>
      <table class="t"><thead><tr><th>ID</th><th>Titre</th><th>Statut</th><th>Assigné à</th><th>MAJ</th></tr></thead><tbody>
        <tr><td class="id">#5821</td><td>Export PPTX de la revue de sprint</td><td><span class="badge success">Done</span></td><td>A. Lebègue</td><td class="s muted">il y a 2 h</td></tr>
        <tr><td class="id">#5817</td><td>Filtrer les artéfacts par assigné</td><td><span class="badge info">En cours</span></td><td>A. Lebègue</td><td class="s muted">il y a 5 h</td></tr>
        <tr><td class="id">#5810</td><td>Connexion OAuth2 + PKCE</td><td><span class="badge success">Done</span></td><td>M. Renard</td><td class="s muted">hier</td></tr>
        <tr><td class="id">#5804</td><td>Indexation FTS5 base de connaissances</td><td><span class="badge warning">À revoir</span></td><td>S. Dupont</td><td class="s muted">hier</td></tr>
        <tr><td class="id">#5799</td><td>Comparaison de builds Jenkins</td><td><span class="badge info">En cours</span></td><td>L. Martin</td><td class="s muted">2 j</td></tr>
        <tr><td class="id">#5790</td><td>Scan de risques IA du sprint</td><td><span class="badge secondary">Backlog</span></td><td>—</td><td class="s muted">3 j</td></tr>
      </tbody></table>
    </div>
    <div class="card" style="width:300px">
      <div class="card-h">${icon('eye')} Détail #5821</div>
      <div style="font-weight:600;font-size:14px;margin-bottom:6px">Export PPTX de la revue de sprint</div>
      <div class="gap6" style="margin-bottom:12px"><span class="badge success">Done</span><span class="badge outline">Sprint 24</span><span class="badge outline">8 pts</span></div>
      <div class="label">Description</div>
      <p class="muted" style="font-size:12px;margin:0 0 12px">Générer la revue de sprint au format Marp puis l'exporter en PowerPoint via le moteur marp-cli embarqué, avec le thème de l'équipe.</p>
      <div class="label">Critères d'acceptation</div>
      <div class="list" style="font-size:12px">
        <div class="gap8" style="padding:4px 0;color:var(--success)">${icon('check')}<span class="foreground">Le fichier .pptx s'ouvre dans PowerPoint</span></div>
        <div class="gap8" style="padding:4px 0;color:var(--success)">${icon('check')}<span>Une slide par artéfact résolu</span></div>
        <div class="gap8" style="padding:4px 0;color:var(--success)">${icon('check')}<span>Thème visuel appliqué</span></div>
      </div>
    </div>
  </div>
</div>`)

// 2) Chatbot -----------------------------------------------------------------
screens.chatbot = page('chatbot', `<div class="page" style="height:100%;display:flex;flex-direction:column">
  <div class="page-head between">
    <div><h2>Chatbot</h2><p>Assistant IA avec outils Tuleap & Jenkins (function calling)</p></div>
    <div class="gap8"><span class="badge info">${icon('bot')} minimax-m2</span><button class="btn outline">${icon('message')} Nouvelle</button></div>
  </div>
  <div class="card" style="flex:1;display:flex;flex-direction:column">
    <div class="chat" style="flex:1">
      <div class="msg user"><div class="bubble">Liste les user stories assignées à Alexandre Lebègue dans le tracker User Stories.</div></div>
      <div class="msg bot"><div style="width:100%">
        <div class="toolchip">${icon('wand')} find_artifacts_by_assignee · { trackerId: 12, assigneeName: "Alexandre Lebègue" }</div>
        <div class="bubble">J'ai trouvé <b>3 user stories</b> assignées à Alexandre Lebègue :
        <ul style="margin:8px 0 0;padding-left:18px">
          <li><b>#5821</b> — Export PPTX de la revue de sprint <span class="badge success">Done</span></li>
          <li><b>#5817</b> — Filtrer les artéfacts par assigné <span class="badge info">En cours</span></li>
          <li><b>#5733</b> — Streaming des logs de build Jenkins <span class="badge secondary">Backlog</span></li>
        </ul></div>
      </div></div>
      <div class="msg user"><div class="bubble">Le build du dernier passe ?</div></div>
      <div class="msg bot"><div style="width:100%">
        <div class="toolchip">${icon('wand')} jenkins_get_build_history · { jobName: "diurne-api", limit: 1 }</div>
        <div class="toolchip">${icon('wand')} jenkins_get_test_report · { jobName: "diurne-api", buildNumber: 87 }</div>
        <div class="bubble">Le <b>build #87</b> de <span class="mono">diurne-api</span> est en <b style="color:oklch(0.55 0.15 145)">SUCCESS</b> ✅<br>
        102 tests · 99 passés · 3 ignorés · 0 échec — durée 4 min 12 s.</div>
      </div></div>
    </div>
    <div class="gap8" style="margin-top:14px"><input class="input" value="Et la couverture de code sur cette branche ?" style="flex:1"><button class="btn primary">${icon('send')} Envoyer</button></div>
  </div>
</div>`)

// 3) Sprint Board ------------------------------------------------------------
const kc = (t, who, pts, badge) => `<div class="kcard"><div class="kt">${t}</div><div class="kf"><span class="gap6">${badge}<span class="badge outline">${pts} pts</span></span><span class="avatar">${who}</span></div></div>`
screens.sprint = page('sprint', `<div class="page">
  <div class="page-head between">
    <div><h2>Sprint Board — Sprint 24</h2><p>12 → 24 juin · 38 points engagés · scan de risques IA</p></div>
    <div class="gap8"><button class="btn outline">${icon('sparkles')} Scanner les risques</button><button class="btn primary">${icon('rocket')} Démarrer le dev → créer une branche</button></div>
  </div>
  <div class="kanban">
    <div class="kcol"><h4>Backlog <span class="badge secondary">3</span></h4>
      ${kc('Scan de risques IA du sprint', 'SD', 5, '<span class="badge secondary">US</span>')}
      ${kc('Burndown chart du sprint', 'LM', 3, '<span class="badge secondary">US</span>')}
      ${kc('Export CSV des artéfacts', 'MR', 2, '<span class="badge secondary">TASK</span>')}
    </div>
    <div class="kcol"><h4>En cours <span class="badge info">2</span></h4>
      ${kc('Filtrer les artéfacts par assigné', 'AL', 5, '<span class="badge info">US</span>')}
      ${kc('Comparaison de builds Jenkins', 'LM', 8, '<span class="badge danger">BUG</span>')}
    </div>
    <div class="kcol"><h4>À revoir <span class="badge warning">1</span></h4>
      ${kc('Indexation FTS5 base de connaissances', 'SD', 8, '<span class="badge warning">US</span>')}
    </div>
    <div class="kcol"><h4>Done <span class="badge success">2</span></h4>
      ${kc('Export PPTX de la revue de sprint', 'AL', 8, '<span class="badge success">US</span>')}
      ${kc('Connexion OAuth2 + PKCE', 'MR', 5, '<span class="badge success">US</span>')}
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="card-h">${icon('alert')} Risques détectés par l'IA</div>
    <div class="gap8" style="padding:6px 0"><span class="badge danger">Élevé</span><span style="font-size:13px">« Comparaison de builds Jenkins » (8 pts) en cours sans critère d'acceptation défini.</span></div>
    <div class="gap8" style="padding:6px 0"><span class="badge warning">Moyen</span><span style="font-size:13px">Capacité dépassée de 6 pts vs vélocité moyenne (32 pts). Envisager de décharger une US.</span></div>
  </div>
</div>`)

// 4) Génération IA -----------------------------------------------------------
screens.generation = page('generation', `<div class="page">
  <div class="page-head between"><div><h2>Génération IA <span class="badge info" style="vertical-align:middle">Phase 1</span></h2><p>Revue de sprint Markdown (Marp) → export PowerPoint</p></div></div>
  <div class="row">
    <div class="card" style="width:340px">
      <div class="card-h">${icon('settings')} Configuration</div>
      <div class="field"><label class="label">Titre de la présentation</label><input class="input" value="Revue Q2 — Équipe DevOps"></div>
      <div class="field"><label class="label">Sprint</label><input class="input" value="Sprint 24 (12 → 24 juin)"></div>
      <div class="field"><label class="label">Tracker</label><input class="input" value="User Stories"></div>
      <div class="field"><label class="label">Statut</label><div class="tabs"><div class="tab active">Clos</div><div class="tab">Ouverts</div><div class="tab">Tous</div></div></div>
      <button class="btn primary" style="width:100%;justify-content:center;margin-top:16px">${icon('sparkles')} Générer la présentation</button>
      <button class="btn success" style="width:100%;justify-content:center;margin-top:10px">${icon('download')} Export PowerPoint</button>
    </div>
    <div class="card" style="flex:1">
      <div class="card-h between"><span>${icon('eye')} Aperçu Marp</span><span class="badge outline">7 slides</span></div>
      <div class="slideprev">
        <div class="accent"></div>
        <h3>Revue de Sprint 24 — Équipe DevOps</h3>
        <ul>
          <li>38 points engagés · 30 points livrés · vélocité 32</li>
          <li>8 user stories clôturées, 2 reportées</li>
          <li>Faits marquants : export PPTX, OAuth2 + PKCE, comparaison de builds Jenkins</li>
          <li>Qualité : 99 % de tests au vert sur diurne-api</li>
        </ul>
        <div class="spacer"></div>
        <div class="gap6"><span class="badge info">DevOps</span><span class="badge outline">Q2 2026</span><span class="badge outline">Confidentiel</span></div>
      </div>
      <div class="grid3" style="margin-top:16px">
        <div class="card" style="text-align:center"><div class="kpi">30</div><div class="kpi-l">Points livrés</div></div>
        <div class="card" style="text-align:center"><div class="kpi">8</div><div class="kpi-l">US clôturées</div></div>
        <div class="card" style="text-align:center"><div class="kpi">99%</div><div class="kpi-l">Tests au vert</div></div>
      </div>
    </div>
  </div>
</div>`)

// 5) PR Reviewer -------------------------------------------------------------
screens['pr-reviewer'] = page('pr-reviewer', `<div class="page">
  <div class="page-head between"><div><h2>Pull Request Reviewer</h2><p>Critères d'acceptation vs diff · comparaison de builds Jenkins</p></div>
    <div class="gap8"><span class="badge outline">${icon('git')} feature/assignee-filter → main</span><button class="btn primary">${icon('sparkles')} Analyse IA</button></div></div>
  <div class="row">
    <div class="card" style="flex:1">
      <div class="card-h">${icon('check')} Critères d'acceptation</div>
      <div class="list" style="font-size:13px">
        <div class="gap8" style="padding:8px 0;color:var(--success)">${icon('check')}<span>Filtre par nom complet ou partiel — <span class="muted">couvert par le diff</span></span></div>
        <div class="gap8" style="padding:8px 0;color:var(--success)">${icon('check')}<span>Recherche insensible à la casse — <span class="muted">couvert par le diff</span></span></div>
        <div class="gap8" style="padding:8px 0;color:oklch(0.55 0.12 70)">${icon('alert')}<span>Pagination au-delà de 200 artéfacts — <span class="muted">partiellement couvert</span></span></div>
      </div>
      <div class="card-h" style="margin-top:16px">${icon('bot')} Synthèse IA</div>
      <p class="muted" style="font-size:13px;margin:0">Le diff implémente le filtrage en mémoire conforme aux 2 premiers critères. Le 3ᵉ critère (pagination) n'est couvert qu'à 200 artéfacts ; ajouter une boucle de pagination ou documenter la limite.</p>
    </div>
    <div class="card" style="width:420px">
      <div class="card-h between"><span>${icon('cpu')} Comparaison de builds Jenkins</span><span class="badge success">SUCCESS</span></div>
      <div class="muted" style="font-size:12px;margin-bottom:12px">main #82 ← feature/assignee-filter #87</div>
      <div class="grid3" style="margin-bottom:14px">
        <div class="card" style="text-align:center;padding:12px"><div class="kpi" style="color:var(--destructive)">0</div><div class="kpi-l">Régressions</div></div>
        <div class="card" style="text-align:center;padding:12px"><div class="kpi" style="color:var(--success)">2</div><div class="kpi-l">Corrections</div></div>
        <div class="card" style="text-align:center;padding:12px"><div class="kpi">3</div><div class="kpi-l">Nouveaux</div></div>
      </div>
      <div class="list" style="font-size:13px">
        <div class="between" style="padding:6px 0"><span>Tests passés</span><span class="badge success">99</span></div>
        <div class="between" style="padding:6px 0"><span>Warnings C++ (cppcheck)</span><span class="badge warning">12</span></div>
        <div class="between" style="padding:6px 0"><span>Couverture de lignes</span><span class="badge info">78,3 %</span></div>
      </div>
      <div class="bar" style="margin-top:10px"><span style="width:78%"></span></div>
    </div>
  </div>
</div>`)

// 6) Jenkins -----------------------------------------------------------------
screens.jenkins = page('jenkins', `<div class="page">
  <div class="page-head between"><div><h2>Jenkins</h2><p>Jobs, builds, rapports de tests & export TTM</p></div>
    <div class="gap8"><button class="btn outline">${icon('refresh')} Découvrir tout</button><span class="badge success"><span class="dot"></span>Connecté</span></div></div>
  <div class="row">
    <div class="card" style="width:320px">
      <div class="card-h">${icon('cpu')} Jobs</div>
      <div class="list">
        <div class="list-row sel"><div class="gap8"><span class="dot"></span><div><div class="t">diurne-api</div><div class="s">pipeline · #87</div></div></div><span class="badge success">SUCCESS</span></div>
        <div class="list-row"><div class="gap8"><span class="dot"></span><div><div class="t">diurne-ui</div><div class="s">pipeline · #143</div></div></div><span class="badge success">SUCCESS</span></div>
        <div class="list-row"><div class="gap8"><span class="dot" style="background:var(--destructive)"></span><div><div class="t">diurne-batch</div><div class="s">pipeline · #51</div></div></div><span class="badge danger">FAILURE</span></div>
        <div class="list-row"><div class="gap8"><span class="dot" style="background:var(--warning)"></span><div><div class="t">diurne-nightly</div><div class="s">multibranch</div></div></div><span class="badge warning">UNSTABLE</span></div>
      </div>
    </div>
    <div class="card" style="flex:1">
      <div class="card-h between"><span>${icon('clock')} diurne-api — Build #87</span><div class="gap8"><span class="badge success">SUCCESS</span><button class="btn outline">${icon('link')} Export TTM</button></div></div>
      <div class="grid3" style="margin-bottom:16px">
        <div class="card" style="text-align:center"><div class="kpi" style="color:var(--success)">99</div><div class="kpi-l">Passés</div></div>
        <div class="card" style="text-align:center"><div class="kpi">3</div><div class="kpi-l">Ignorés</div></div>
        <div class="card" style="text-align:center"><div class="kpi" style="color:var(--destructive)">0</div><div class="kpi-l">Échecs</div></div>
      </div>
      <div class="card-h">Historique récent</div>
      <table class="t"><thead><tr><th>Build</th><th>Résultat</th><th>Durée</th><th>Démarré</th></tr></thead><tbody>
        <tr><td class="mono">#87</td><td><span class="badge success">SUCCESS</span></td><td>4 min 12 s</td><td class="muted">il y a 2 h</td></tr>
        <tr><td class="mono">#86</td><td><span class="badge danger">FAILURE</span></td><td>3 min 48 s</td><td class="muted">il y a 5 h</td></tr>
        <tr><td class="mono">#85</td><td><span class="badge success">SUCCESS</span></td><td>4 min 05 s</td><td class="muted">hier</td></tr>
        <tr><td class="mono">#84</td><td><span class="badge warning">UNSTABLE</span></td><td>4 min 30 s</td><td class="muted">hier</td></tr>
      </tbody></table>
    </div>
  </div>
</div>`)

// 7) Configuration -----------------------------------------------------------
screens.settings = page('settings', `<div class="page">
  <div class="page-head"><h2>Configuration</h2><p>Connexion Tuleap, authentification, projet et fournisseur LLM</p></div>
  <div class="grid2">
    <div class="card">
      <div class="card-h">${icon('link')} Connexion Tuleap</div>
      <div class="field"><label class="label">URL Tuleap</label><input class="input" value="https://tuleap.example.com"></div>
      <div class="field"><label class="label">Authentification</label><div class="tabs"><div class="tab active">Token API personnel</div><div class="tab">OAuth2 + PKCE</div></div></div>
      <div class="field"><label class="label">Token API</label><input class="input" value="••••••••••••••••••••••••" type="text"></div>
      <div class="gap8" style="margin-top:14px"><button class="btn primary">${icon('check')} Tester la connexion</button><span class="badge success">${icon('check')} GET /api/users/self · 200 OK</span></div>
    </div>
    <div class="card">
      <div class="card-h">${icon('bot')} Fournisseur LLM</div>
      <div class="field"><label class="label">Provider</label><div class="tabs"><div class="tab active">OpenRouter</div><div class="tab">Local (Ollama)</div></div></div>
      <div class="field"><label class="label">Modèle</label><input class="input" value="minimax/minimax-m2:free"></div>
      <div class="field"><label class="label">Clé API OpenRouter</label><input class="input" value="••••••••••••••••••••"></div>
      <div class="gap8" style="margin-top:14px"><button class="btn outline">${icon('sparkles')} Tester le LLM</button><span class="badge success">${icon('check')} Réponse en 0,8 s</span></div>
    </div>
    <div class="card">
      <div class="card-h">${icon('kanban')} Projet de travail</div>
      <div class="field"><label class="label">Projet sélectionné</label><input class="input" value="Plateforme Diurne — Équipe DevOps"></div>
      <div class="gap6" style="margin-top:12px"><span class="badge outline">ID 142</span><span class="badge outline">23 trackers</span><span class="badge outline">484 artéfacts</span></div>
    </div>
    <div class="card">
      <div class="card-h">${icon('cpu')} Intégrations</div>
      <div class="list" style="font-size:13px">
        <div class="between" style="padding:7px 0"><span class="gap8">${icon('cpu')} Jenkins</span><span class="badge success">Configuré</span></div>
        <div class="between" style="padding:7px 0"><span class="gap8">${icon('flask')} Tracker TTM</span><span class="badge success">ID 18</span></div>
        <div class="between" style="padding:7px 0"><span class="gap8">${icon('code')} OpenCode (Coder)</span><span class="badge info">Détecté</span></div>
        <div class="between" style="padding:7px 0"><span class="gap8">${icon('git')} Dépôts Git</span><span class="badge outline">7 mappés</span></div>
      </div>
    </div>
  </div>
</div>`)

// write
for (const [name, html] of Object.entries(screens)) {
  fs.writeFileSync(path.join(OUT, `${name}.html`), html)
}
console.log('wrote', Object.keys(screens).length, 'screens:', Object.keys(screens).join(', '))
