/**
 * Tests d'intégration du pipeline de génération de sprint review enrichi :
 * user stories + sous-tâches hiérarchisées, dernières mises à jour
 * (changesets), branches Git et pull requests associées.
 *
 * Stratégie : un vrai TuleapClient branché sur un faux serveur REST en
 * mémoire (fetchImpl), un faux provider LLM à réponses préparées — aucun
 * réseau, aucun Electron.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TuleapClient } from '../src/main/tuleap/client'
import type { SprintReviewProgressEvent } from '@shared/types'

// ─── Faux serveur Tuleap ─────────────────────────────────────────────────────

const BASE_URL = 'https://tuleap.example.com'
const PROJECT_ID = 55
const MILESTONE_ID = 850

function jsonRes(body: unknown, total?: number): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (total !== undefined) headers['X-PAGINATION-SIZE'] = String(total)
  return new Response(JSON.stringify(body), { status: 200, headers })
}

const tracker = { id: 301 }

const milestone = {
  id: MILESTONE_ID,
  uri: `milestones/${MILESTONE_ID}`,
  label: 'Sprint 24.07',
  status: 'open',
  semantic_status: 'open',
  start_date: '2026-06-23T00:00:00+02:00',
  end_date: '2026-07-07T00:00:00+02:00',
  html_url: `/plugins/agiledashboard/?planning[]=${MILESTONE_ID}`
}

type FakeArtifact = {
  id: number
  title: string
  status: string
  submitted_by_user: { real_name: string; username: string }
  submitted_on: string
  last_modified_date: string
  values?: unknown[]
}

function art(a: FakeArtifact): Record<string, unknown> {
  return { uri: `artifacts/${a.id}`, tracker, ...a }
}

const US_1201 = art({
  id: 1201,
  title: 'US — Export PDF des rapports d’audit',
  status: 'En cours',
  submitted_by_user: { real_name: 'Alice Martin', username: 'amartin' },
  submitted_on: '2026-06-20T09:00:00+02:00',
  last_modified_date: '2026-07-04T16:12:00+02:00',
  values: [
    { field_id: 1, label: 'Story points', type: 'computed', value: 8 },
    { field_id: 2, label: 'Assigné à', type: 'tbl', values: [{ display_name: 'Alice Martin' }] },
    {
      field_id: 3,
      label: 'Description',
      type: 'text',
      value: 'En tant qu’auditeur, je veux exporter mes rapports en PDF afin de les archiver.'
    },
    {
      field_id: 5,
      label: "Critères d'acceptance",
      type: 'text',
      value:
        '<ul><li>Le PDF respecte le gabarit officiel</li><li>Export en moins de 10 secondes</li></ul>'
    },
    { field_id: 6, label: 'Remaining Effort', type: 'computed', value: 12 },
    {
      field_id: 7,
      label: 'Cross References',
      type: 'cross',
      value: [
        { ref: 'pr #77', url: 'https://tuleap.example.com/pr/77', direction: 'out' },
        { ref: 'git #webapp/bbb222', url: 'https://tuleap.example.com/g/bbb222', direction: 'in' }
      ]
    },
    { field_id: 8, label: 'Rank', type: 'int', value: 12984 },
    { field_id: 9, label: 'Last Modified On', type: 'lud', value: '2026-07-04T16:12:00+02:00' }
  ]
})

const US_1202 = art({
  id: 1202,
  title: 'US — Authentification SSO (SAML)',
  status: 'Terminé',
  submitted_by_user: { real_name: 'Bob Durand', username: 'bdurand' },
  submitted_on: '2026-06-18T10:00:00+02:00',
  last_modified_date: '2026-07-02T11:00:00+02:00',
  values: [{ field_id: 1, label: 'Story points', type: 'computed', value: 5 }]
})

const BUG_1203 = art({
  id: 1203,
  title: 'Bug — Crash à l’ouverture du dashboard',
  status: 'En cours',
  submitted_by_user: { real_name: 'Chloé Petit', username: 'cpetit' },
  submitted_on: '2026-06-25T14:00:00+02:00',
  last_modified_date: '2026-07-05T09:30:00+02:00',
  values: [{ field_id: 4, label: 'Sévérité', type: 'sb', values: [{ id: 9, label: 'Critique' }] }]
})

const US_1204 = art({
  id: 1204,
  title: 'US — Notifications e-mail configurables',
  status: 'À faire',
  submitted_by_user: { real_name: 'Alice Martin', username: 'amartin' },
  submitted_on: '2026-06-22T09:00:00+02:00',
  last_modified_date: '2026-06-22T09:00:00+02:00'
})

const TASK_1210 = art({
  id: 1210,
  title: 'Générer le PDF côté serveur (lib wkhtmltopdf)',
  status: 'Terminé',
  submitted_by_user: { real_name: 'Alice Martin', username: 'amartin' },
  submitted_on: '2026-06-24T09:00:00+02:00',
  last_modified_date: '2026-07-01T17:00:00+02:00'
})

const TASK_1211 = art({
  id: 1211,
  title: 'Page de prévisualisation avant export',
  status: 'En cours',
  submitted_by_user: { real_name: 'David Roux', username: 'droux' },
  submitted_on: '2026-06-24T09:05:00+02:00',
  last_modified_date: '2026-07-04T16:12:00+02:00'
})

const TASK_1212 = art({
  id: 1212,
  title: 'Configurer le connecteur SAML côté IdP',
  status: 'Terminé',
  submitted_by_user: { real_name: 'Bob Durand', username: 'bdurand' },
  submitted_on: '2026-06-19T09:00:00+02:00',
  last_modified_date: '2026-07-02T10:45:00+02:00'
})

// Epic parent des US 1201 et 1204 (tracker 300 « Epics »).
const EPIC_TRACKER = { id: 300, uri: 'trackers/300', label: 'Epics', item_name: 'epic' }
const EPIC_1100 = {
  id: 1100,
  uri: 'artifacts/1100',
  tracker: { id: 300 },
  title: 'Epic — Dématérialisation des rapports d’audit',
  status: 'En cours',
  submitted_by_user: { real_name: 'Alice Martin', username: 'amartin' },
  submitted_on: '2026-05-02T09:00:00+02:00',
  last_modified_date: '2026-07-04T16:20:00+02:00',
  values: [
    {
      field_id: 30,
      label: 'Description',
      type: 'text',
      value:
        'Supprimer le papier du processus d’audit : génération, export et archivage numérique des rapports.'
    },
    { field_id: 31, label: 'Story points', type: 'computed', value: 34 }
  ]
}

const ALL_ARTIFACTS = [
  US_1201,
  US_1202,
  BUG_1203,
  US_1204,
  TASK_1210,
  TASK_1211,
  TASK_1212,
  EPIC_1100
]
const CHILDREN: Record<number, unknown[]> = {
  1201: [TASK_1210, TASK_1211],
  1202: [TASK_1212],
  1203: [],
  1204: []
}
/** Parents (liens _is_child en sens reverse) : US → epics. */
const PARENTS: Record<number, unknown[]> = {
  1201: [EPIC_1100],
  1204: [EPIC_1100]
}

const CHANGESETS: Record<number, unknown[]> = {
  1201: [
    {
      id: 9001,
      submitted_on: '2026-07-04T16:12:00+02:00',
      submitted_by_details: { display_name: 'Alice Martin' },
      last_comment: { body: '', format: 'text' }
    },
    {
      id: 9000,
      submitted_on: '2026-07-03T11:40:00+02:00',
      submitted_by_details: { display_name: 'David Roux' },
      last_comment: {
        body: '<p>PDF serveur OK, reste la prévisualisation — PR ouverte pour revue.</p>',
        format: 'html'
      }
    }
  ],
  1202: [
    {
      id: 9010,
      submitted_on: '2026-07-02T11:00:00+02:00',
      submitted_by_details: { display_name: 'Bob Durand' },
      last_comment: { body: 'Recette validée en préprod, story fermée.', format: 'text' }
    }
  ],
  1203: [
    {
      id: 9020,
      submitted_on: '2026-07-05T09:30:00+02:00',
      submitted_by_details: { display_name: 'Chloé Petit' },
      last_comment: {
        body: 'Reproduit uniquement avec le cache vide — correctif en cours sur fix/1203.',
        format: 'text'
      }
    }
  ],
  1204: [],
  1210: [
    {
      id: 9030,
      submitted_on: '2026-07-01T17:00:00+02:00',
      submitted_by_details: { display_name: 'Alice Martin' },
      last_comment: { body: 'Terminé, couvert par tests unitaires.', format: 'text' }
    }
  ],
  1211: [],
  1212: []
}

const GIT_REPOS = [{ id: 12, name: 'webapp', description: 'Application principale' }]

const BRANCHES = [
  {
    name: 'main',
    commit: {
      id: 'aaa111',
      title: 'Merge SSO',
      author_name: 'Bob Durand',
      authored_date: '2026-07-02T11:05:00+02:00'
    }
  },
  {
    name: 'feature/1201-export-pdf',
    commit: {
      id: 'bbb222',
      title: 'feat(export): page de prévisualisation PDF',
      author_name: 'David Roux',
      authored_date: '2026-07-04T15:58:00+02:00'
    }
  },
  {
    name: 'fix/1203-dashboard-crash',
    commit: {
      id: 'ccc333',
      title: 'fix(dashboard): guard sur cache vide',
      author_name: 'Chloé Petit',
      authored_date: '2026-07-05T09:10:00+02:00'
    }
  },
  {
    name: 'feature/999-hors-sprint',
    commit: {
      id: 'ddd444',
      title: 'wip',
      author_name: 'X',
      authored_date: '2026-06-01T09:00:00+02:00'
    }
  }
]

const PULL_REQUESTS = [
  {
    id: 77,
    title: 'Export PDF des rapports (art #1201)',
    branch_src: 'feature/1201-export-pdf',
    branch_dest: 'main',
    status: 'review',
    html_url: '/plugins/git/webapp/pull-requests/77',
    creation_date: '2026-07-03T11:35:00+02:00',
    creator: { display_name: 'David Roux' },
    repository: { id: 12, name: 'webapp' }
  },
  {
    id: 78,
    title: 'Correctif crash dashboard',
    branch_src: 'fix/1203-dashboard-crash',
    branch_dest: 'main',
    status: 'review',
    html_url: '/plugins/git/webapp/pull-requests/78',
    creation_date: '2026-07-05T09:20:00+02:00',
    creator: { display_name: 'Chloé Petit' },
    repository: { id: 12, name: 'webapp' }
  }
]

const RELEASE_900 = {
  id: 900,
  uri: 'milestones/900',
  label: 'Release 2026.2',
  status: 'closed',
  semantic_status: 'closed',
  start_date: '2026-05-01T00:00:00+02:00',
  end_date: '2026-08-31T00:00:00+02:00',
  html_url: null
}

const SPRINT_901 = {
  id: 901,
  uri: 'milestones/901',
  label: 'Sprint 24.08 (imbriqué)',
  status: 'open',
  semantic_status: 'open',
  start_date: '2026-07-08T00:00:00+02:00',
  end_date: '2026-07-22T00:00:00+02:00',
  html_url: null
}

const SUB_MILESTONES: Record<number, unknown[]> = {
  900: [SPRINT_901],
  901: [],
  [MILESTONE_ID]: []
}

function fakeTuleapFetch(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString()
  const { pathname, searchParams } = new URL(url)

  if (pathname === `/api/projects/${PROJECT_ID}`) {
    return Promise.resolve(
      jsonRes({
        id: PROJECT_ID,
        uri: `projects/${PROJECT_ID}`,
        label: 'Portail Audit',
        shortname: 'portail-audit'
      })
    )
  }
  if (pathname === `/api/milestones/${MILESTONE_ID}`) {
    return Promise.resolve(jsonRes(milestone))
  }
  // Milestones du projet : une release close contenant un sprint ouvert imbriqué
  // + le sprint 850 au niveau racine.
  if (pathname === `/api/projects/${PROJECT_ID}/milestones`) {
    const items = [RELEASE_900, milestone]
    return Promise.resolve(jsonRes(items, items.length))
  }
  const subMilestones = pathname.match(/^\/api\/milestones\/(\d+)\/milestones$/)
  if (subMilestones) {
    const items = SUB_MILESTONES[Number(subMilestones[1])] ?? []
    return Promise.resolve(jsonRes(items, items.length))
  }
  if (pathname === `/api/milestones/${MILESTONE_ID}/content`) {
    const items = [US_1201, US_1202, BUG_1203, US_1204]
    return Promise.resolve(jsonRes(items, items.length))
  }
  const linked = pathname.match(/^\/api\/artifacts\/(\d+)\/linked_artifacts$/)
  if (linked) {
    const table = searchParams.get('direction') === 'reverse' ? PARENTS : CHILDREN
    const items = table[Number(linked[1])] ?? []
    return Promise.resolve(jsonRes({ collection: items }, items.length))
  }
  if (pathname === '/api/trackers/300') {
    return Promise.resolve(jsonRes(EPIC_TRACKER))
  }
  const changesets = pathname.match(/^\/api\/artifacts\/(\d+)\/changesets$/)
  if (changesets) {
    const items = CHANGESETS[Number(changesets[1])] ?? []
    return Promise.resolve(jsonRes(items, items.length))
  }
  const artifact = pathname.match(/^\/api\/artifacts\/(\d+)$/)
  if (artifact) {
    const found = ALL_ARTIFACTS.find((a) => (a as { id: number }).id === Number(artifact[1]))
    if (found) return Promise.resolve(jsonRes(found))
    return Promise.resolve(new Response('not found', { status: 404 }))
  }
  if (pathname === `/api/projects/${PROJECT_ID}/git`) {
    return Promise.resolve(jsonRes({ repositories: GIT_REPOS }, GIT_REPOS.length))
  }
  if (pathname === '/api/git/12/branches') {
    return Promise.resolve(jsonRes(BRANCHES, BRANCHES.length))
  }
  if (pathname === '/api/git/12/pull_requests') {
    expect(searchParams.get('query')).toBe(JSON.stringify({ status: 'open' }))
    return Promise.resolve(jsonRes({ collection: PULL_REQUESTS }, PULL_REQUESTS.length))
  }
  return Promise.resolve(new Response(`no route for ${pathname}`, { status: 404 }))
}

const fakeClient = new TuleapClient({
  baseUrl: BASE_URL,
  token: 'test-token',
  fetchImpl: fakeTuleapFetch as typeof fetch
})

vi.mock('../src/main/tuleap/build', () => ({
  buildTuleapClient: async () => fakeClient
}))

// Le scan par clone est mocké : pas de git ni de réseau dans les tests. Le
// module réel tire electron-store (config) — il n'est importé (dynamiquement)
// que lorsque l'option storySlides est active. vi.hoisted : les factories de
// vi.mock sont remontées avant les const du module.
const { deepScanMock } = vi.hoisted(() => ({
  deepScanMock: vi.fn()
}))
deepScanMock.mockImplementation(async () => ({
  branches: [
    {
      repoName: 'webapp',
      branchName: 'feature/1201-export-pdf',
      artifactIds: [1201],
      lastCommitTitle: 'feat(export): page de prévisualisation PDF',
      lastCommitAuthor: 'David Roux',
      lastCommitDate: '2026-07-04T15:58:00+02:00',
      ahead: 3,
      behind: 1,
      baseBranch: 'main'
    },
    {
      repoName: 'webapp',
      branchName: 'fix/1203-dashboard-crash',
      artifactIds: [1203],
      lastCommitTitle: 'fix(dashboard): guard sur cache vide',
      lastCommitAuthor: 'Chloé Petit',
      lastCommitDate: '2026-07-05T09:10:00+02:00',
      ahead: 0,
      behind: 0,
      baseBranch: 'main'
    }
  ],
  branchesScanned: 4,
  clonedRepos: 1,
  warnings: [],
  commitsByRepo: [{ repoName: 'webapp', commits: 42 }],
  repoSprintStats: [
    {
      repoName: 'webapp',
      commits: 42,
      activeBranches: [
        {
          name: 'main',
          commits: 25,
          lastCommitDate: '2026-07-05T10:00:00+02:00',
          isNew: false,
          isDefault: true
        },
        {
          name: 'feature/1201-export-pdf',
          commits: 12,
          lastCommitDate: '2026-07-04T15:58:00+02:00',
          isNew: true,
          isDefault: false
        },
        {
          name: 'fix/1203-dashboard-crash',
          commits: 5,
          lastCommitDate: '2026-07-05T09:10:00+02:00',
          isNew: true,
          isDefault: false
        }
      ],
      filesChanged: 87,
      additions: 4210,
      deletions: 1180,
      authors: 4,
      commitLog: [
        {
          title: 'feat(export): page de prévisualisation PDF',
          author: 'David Roux',
          date: '2026-07-04T15:58:00+02:00'
        },
        {
          title: 'fix(dashboard): guard sur cache vide',
          author: 'Chloé Petit',
          date: '2026-07-05T09:10:00+02:00'
        },
        {
          title: 'feat(pdf): génération serveur via wkhtmltopdf',
          author: 'Alice Martin',
          date: '2026-07-01T16:40:00+02:00'
        },
        { title: 'chore: bump deps', author: 'Bob Durand', date: '2026-06-25T10:00:00+02:00' }
      ],
      topFiles: [
        { path: 'src/pdf/render.ts', additions: 1210, deletions: 80 },
        { path: 'src/dashboard/cache.ts', additions: 240, deletions: 190 },
        { path: 'package-lock.json', additions: 2100, deletions: 800 }
      ]
    }
  ]
}))

vi.mock('../src/main/generation/deep-scan', () => ({
  deepScanBranches: deepScanMock
}))

// ─── Faux LLM ────────────────────────────────────────────────────────────────

/**
 * Réponses préparées, dans l'ordre des appels du pipeline :
 * synthèse, puis chaque slide LLM (le slide code_activity est déterministe,
 * il ne consomme pas de réponse).
 */
const CANNED_SUMMARY = `## Objectif du sprint
Livrer l'export PDF des rapports d'audit et finaliser l'authentification SSO, tout en corrigeant le crash du dashboard.

## État d'avancement
La story SSO (#1202) est terminée et recettée. L'export PDF (#1201) est bien avancé : la génération serveur (#1210) est terminée, la prévisualisation (#1211) est en cours et une pull request (PR #77) attend sa revue. Le correctif du crash dashboard (#1203) est en cours avec la PR #78 ouverte. Les notifications e-mail (#1204) n'ont pas démarré.

## Points notables
- 2 pull requests en attente de revue (PR #77, PR #78).
- La branche feature/1201-export-pdf a reçu un commit le 2026-07-04.
- Recette SSO validée en préproduction le 2026-07-02.

## Risques & blocages
- #1204 sans activité ni branche : risque de report en fin de sprint.
- PR #77 ouverte depuis le 2026-07-03, revue à planifier.`

const CANNED_SLIDES: Record<string, string> = {
  slide_titre: `# 🚀 Sprint Review — Sprint 24.07

<div class="slide-body">

## Portail Audit

**Période :** 2026-06-23 → 2026-07-07

**Statut :** Ouvert — 4 artefacts (1 terminé, 2 en cours, 1 à venir)

</div>

<div class="slide-footer">
<small>Présentation générée le 2026-07-08 — Données Tuleap</small>
</div>`,
  slide_contexte: `# 🧭 Contexte & objectifs

<div class="slide-body">

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
</div>`,
  slide_equipe: `# 👥 Équipe & Activité

<div class="slide-body">

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

[[ACTIVITE_DEPOTS]]

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
</div>`,
  slide_livrables: `# 📦 Livrables & Planning

<div class="slide-body">

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
</div>`,
  slide_avancement: `# 📈 Avancement des travaux

<div class="slide-body">

<div class="stat-bar">
<div class="stat-item">
<span class="stat-icon">📦</span>
<span class="stat-text">
<span class="stat-value">4</span>
<span class="stat-label">Total items</span>
</span>
</div>
<div class="stat-item">
<span class="stat-icon">📈</span>
<span class="stat-text">
<span class="stat-value">25<span class="stat-unit">%</span></span>
<span class="stat-label">Avancement</span>
</span>
</div>
<div class="stat-item">
<span class="stat-icon">📍</span>
<span class="stat-text">
<span class="stat-value">En cours de livraison</span>
<span class="stat-label">Phase</span>
</span>
</div>
</div>

<div class="task-section">
<div class="task-section-head"><h2>✅ Terminés</h2><span class="task-section-meta">1 item</span></div>
<div class="task-grid">
<div class="task-card is-done">
<div class="task-card-head"><span class="task-card-type">📘</span><span class="task-card-title">Authentification SSO (SAML)</span></div>
<div class="task-card-meta"><span class="tag tag-green">Terminé</span><span class="task-card-owner"><span class="task-card-avatar">BD</span></span></div>
<div class="task-card-bar"><div class="task-card-bar-fill w-100"></div></div>
<div class="task-card-effort"><span>#1202</span><strong>100%</strong></div>
</div>
</div>
</div>

<div class="task-section">
<div class="task-section-head"><h2>🔄 En cours</h2><span class="task-section-meta">2 items</span></div>
<div class="task-grid">
<div class="task-card is-encours">
<div class="task-card-head"><span class="task-card-type">📘</span><span class="task-card-title">Export PDF des rapports d'audit</span></div>
<div class="task-card-meta"><span class="tag tag-orange">En cours</span><span class="task-card-owner"><span class="task-card-avatar">AM</span></span></div>
<div class="task-card-bar"><div class="task-card-bar-fill w-50"></div></div>
<div class="task-card-effort"><span>#1201</span><strong>50%</strong></div>
</div>
<div class="task-card is-encours">
<div class="task-card-head"><span class="task-card-type">🐞</span><span class="task-card-title">Crash à l'ouverture du dashboard</span></div>
<div class="task-card-meta"><span class="tag tag-orange">En cours</span><span class="task-card-owner"><span class="task-card-avatar">CP</span></span></div>
<div class="task-card-bar"><div class="task-card-bar-fill w-50"></div></div>
<div class="task-card-effort"><span>#1203</span><strong>50%</strong></div>
</div>
</div>
</div>

<div class="task-section">
<div class="task-section-head"><h2>⏳ À venir</h2><span class="task-section-meta">1 item</span></div>
<div class="task-grid">
<div class="task-card is-avenir">
<div class="task-card-head"><span class="task-card-type">📘</span><span class="task-card-title">Notifications e-mail configurables</span></div>
<div class="task-card-meta"><span class="tag tag-blue">À venir</span><span class="task-card-owner"><span class="task-card-avatar">AM</span></span></div>
<div class="task-card-bar"><div class="task-card-bar-fill w-0"></div></div>
<div class="task-card-effort"><span>#1204</span><strong>0%</strong></div>
</div>
</div>
</div>

</div>

<div class="slide-footer">
<small>Données TULEAP extraites le 2026-07-08</small>
</div>`,
  slide_indicateurs: `# 📊 Indicateurs du sprint

<div class="slide-body">

<div class="gauge-card">
<div class="gauge-head"><span class="gauge-title">📈 Avancement global</span><span class="gauge-value">25<span class="gauge-unit">%</span></span></div>
<div class="gauge-bar"><div class="gauge-bar-fill w-25"></div></div>
<div class="gauge-meta"><span>1 terminé / 4 items</span><strong>2 en cours</strong></div>
</div>

<div class="kpi-card success"><strong>SSO livré</strong> — recette préprod validée le 2026-07-02</div>
<div class="kpi-card warning"><strong>2 PR en attente</strong> — PR #77 et PR #78 à faire relire</div>
<div class="kpi-card"><strong>Activité code</strong> — 2 branches actives liées au sprint</div>

</div>

<div class="slide-footer">
<small>Données au 2026-07-08</small>
</div>`,
  slide_risques: `# ⚠️ Risques & Contraintes

<div class="slide-body">

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
</div>`,
  slide_synthese: `# 🎯 Synthèse du sprint

<div class="slide-body">

<div class="columns">
<div class="col">

## Faits marquants

{POINTS}

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
</div>`,
  slide_repo_nouveautes: `# Dépôt webapp — nouveautés du sprint

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

- \`src/pdf/\` — moteur de génération PDF largement remanié
- \`src/dashboard/\` — robustesse du cache

</div>

<div class="slide-footer">
<small>Dépôt webapp · analyse des 42 commits du sprint · données au 2026-07-08</small>
</div>`
}

// Remplacement volontairement laissé pour vérifier la détection de
// placeholders non remplacés ({POINTS} dans slide_synthese).
const SYNTHESE_POINTS = `<div class="kpi-card success">
<strong>SSO en production</strong> — story #1202 terminée et recettée
</div>
<div class="kpi-card warning">
<strong>2 PR à relire</strong> — export PDF et fix dashboard
</div>
<div class="kpi-card">
<strong>Sprint à 25%</strong> — 2 items en cours, 1 à venir
</div>`

const llmCalls: { system: string; user: string }[] = []

function cannedResponse(system: string, user: string): string {
  llmCalls.push({ system, user })
  if (user.includes('Produis une synthèse structurée')) return CANNED_SUMMARY
  // Chaque system prompt contient « Consignes specifiques pour ce slide (XXX… » ;
  // le slide de titre, sans consignes, se reconnaît à son user prompt.
  const markers: Record<string, string> = {
    slide_contexte: '(CONTEXTE',
    slide_equipe: '(EQUIPE',
    slide_livrables: '(LIVRABLES',
    slide_avancement: '(AVANCEMENT',
    slide_indicateurs: '(INDICATEURS',
    slide_risques: '(RISQUES',
    slide_synthese: '(SYNTHESE',
    slide_repo_nouveautes: '(NOUVEAUTES DEPOT'
  }
  for (const [key, marker] of Object.entries(markers)) {
    if (system.includes(`Consignes specifiques pour ce slide ${marker}`)) {
      const md = CANNED_SLIDES[key]
      return key === 'slide_synthese' ? md.replace('{POINTS}', SYNTHESE_POINTS) : md
    }
  }
  if (user.includes('slide de TITRE')) return CANNED_SLIDES.slide_titre
  return '# Slide inconnu'
}

vi.mock('../src/main/llm', () => ({
  resolveLlmProvider: () => ({
    name: 'fake',
    generate: async (req: { messages: { role: string; content: string }[] }) => {
      const system = req.messages.find((m) => m.role === 'system')?.content ?? ''
      const user = req.messages.find((m) => m.role === 'user')?.content ?? ''
      return {
        text: cannedResponse(system, user),
        model: 'fake/qwen3-30b',
        finishReason: 'stop',
        usage: { inputTokens: 1000, outputTokens: 400, totalTokens: 1400 }
      }
    },
    runTools: async () => {
      throw new Error('not used')
    }
  })
}))

// Import APRÈS les vi.mock (hoistés par vitest).
import { runSprintReviewPipeline } from '../src/main/generation/pipeline'
import {
  buildEnrichedContext,
  matchArtifactIds,
  summarizeChangesets
} from '../src/main/generation/enricher'
import { formatCodeActivityBlock, formatRecentUpdatesBlock } from '../src/main/generation/utils'
import { buildCodeActivitySlide } from '../src/main/generation/code-activity-slide'
import { buildUsRecapSlides } from '../src/main/generation/us-slides'
import { listMilestonesWithChildren } from '../src/main/tuleap/milestones'

beforeEach(() => {
  llmCalls.length = 0
})

// ─── Tests unitaires ciblés ──────────────────────────────────────────────────

describe('matchArtifactIds', () => {
  const known = new Set([1201, 1203, 42])

  it('détecte les conventions usuelles de nommage de branches', () => {
    expect(matchArtifactIds('feature/1201-export-pdf', known)).toEqual([1201])
    expect(matchArtifactIds('tuleap-1203', known)).toEqual([1203])
    expect(matchArtifactIds('art_42_test', known)).toEqual([42])
    expect(matchArtifactIds('US #1201 et bug #1203', known)).toEqual([1201, 1203])
  })

  it('ignore les nombres qui ne sont pas des artefacts du sprint', () => {
    expect(matchArtifactIds('feature/999-hors-sprint', known)).toEqual([])
    expect(matchArtifactIds('release-2026', known)).toEqual([])
  })

  it('déduplique', () => {
    expect(matchArtifactIds('1201-fix-1201', known)).toEqual([1201])
  })
})

describe('summarizeChangesets', () => {
  it('prend la date du plus récent et le premier commentaire non vide', () => {
    const update = summarizeChangesets([
      {
        submitted_on: '2026-07-04T16:12:00+02:00',
        submitted_by_details: { display_name: 'Alice' },
        last_comment: { body: '' }
      },
      {
        submitted_on: '2026-07-03T11:40:00+02:00',
        submitted_by_details: { display_name: 'David' },
        last_comment: { body: '<p>Un <b>commentaire</b></p>' }
      }
    ])
    expect(update.date).toBe('2026-07-04T16:12:00+02:00')
    expect(update.author).toBe('Alice')
    expect(update.comment).toBe('Un commentaire')
    expect(update.changesetCount).toBe(2)
  })

  it('gère la liste vide', () => {
    const update = summarizeChangesets([])
    expect(update.date).toBeNull()
    expect(update.author).toBeNull()
    expect(update.comment).toBeNull()
  })
})

describe('buildCodeActivitySlide', () => {
  it('retourne null quand il n’y a rien à montrer', () => {
    expect(
      buildCodeActivitySlide(
        { reposScanned: 0, branchesScanned: 0, branches: [], pullRequests: [], warnings: [] },
        '2026-07-08'
      )
    ).toBeNull()
  })
})

// ─── Test d'intégration : contexte enrichi ───────────────────────────────────

describe('buildEnrichedContext (sprint mode, faux serveur Tuleap)', () => {
  it('récupère hiérarchie, dernières mises à jour, branches et PRs', async () => {
    const events: SprintReviewProgressEvent[] = []
    const ctx = await buildEnrichedContext(
      { mode: 'sprint', milestoneId: MILESTONE_ID },
      'Portail Audit',
      PROJECT_ID,
      'fr',
      (e) => events.push(e)
    )

    // Hiérarchie US → sous-tâches
    expect(ctx.artifacts.map((a) => a.id)).toEqual([1201, 1202, 1203, 1204])
    expect(ctx.childArtifactIds).toEqual(new Set([1210, 1211, 1212]))
    expect(ctx.childrenByParent.get(1201)).toEqual([1210, 1211])
    expect(ctx.childrenByParent.get(1202)).toEqual([1212])

    // Dernières mises à jour (changesets)
    const lu1201 = ctx.lastUpdates.get(1201)
    expect(lu1201?.date).toBe('2026-07-04T16:12:00+02:00')
    expect(lu1201?.author).toBe('Alice Martin')
    expect(lu1201?.comment).toContain('PR ouverte pour revue')

    // Branches : seules celles liées à un artefact du sprint sont retenues
    expect(ctx.codeActivity.reposScanned).toBe(1)
    expect(ctx.codeActivity.branches.map((b) => b.branchName).sort()).toEqual([
      'feature/1201-export-pdf',
      'fix/1203-dashboard-crash'
    ])
    expect(
      ctx.codeActivity.branches.find((b) => b.branchName === 'feature/1201-export-pdf')?.artifactIds
    ).toEqual([1201])

    // Pull requests : toutes remontées, avec matching artefact
    expect(ctx.codeActivity.pullRequests.map((p) => p.id).sort()).toEqual([77, 78])
    const pr77 = ctx.codeActivity.pullRequests.find((p) => p.id === 77)
    expect(pr77?.artifactIds).toEqual([1201])
    expect(pr77?.creator).toBe('David Roux')

    // Événements de progression émis pour les nouvelles étapes
    expect(events.some((e) => e.type === 'activity')).toBe(true)
    expect(
      events.filter((e) => e.type === 'code_scan').map((e) => (e as { step: string }).step)
    ).toEqual(['repos', 'branches', 'pull_requests'])
  })
})

// ─── Test d'intégration : pipeline complet ───────────────────────────────────

describe('runSprintReviewPipeline (bout en bout, LLM mocké)', () => {
  it('produit un deck complet avec le slide code déterministe et nourrit le LLM des données enrichies', async () => {
    const events: SprintReviewProgressEvent[] = []
    const result = await runSprintReviewPipeline(
      {
        source: { mode: 'sprint', milestoneId: MILESTONE_ID },
        projectName: 'Portail Audit',
        projectId: PROJECT_ID,
        language: 'fr'
      },
      (e) => events.push(e)
    )

    // 11 slides annoncés (8 LLM + 3 déterministes), dans l'ordre
    const started = events
      .filter((e) => e.type === 'slide_start')
      .map((e) => (e as { slide: string }).slide)
    expect(started).toEqual([
      'titre',
      'contexte',
      'us_recap',
      'epic',
      'equipe',
      'livrables',
      'avancement',
      'code_activity',
      'repo_activity',
      'repo_news',
      'indicateurs',
      'risques',
      'synthese'
    ])

    // Le slide récapitulatif des US est présent, déterministe, avec statut,
    // description, compteur de tâches et indicateurs code.
    expect(result.markdown).toContain('# 📋 Récapitulatif des user stories')
    expect(result.markdown).toMatch(
      /\| #1201 \| US — Export PDF des rapports d’audit \| <span class="tag tag-orange">En cours<\/span> \| En tant qu’auditeur[^|]*\| 1\/2 \| 🌿 🔀 \|/
    )
    expect(result.markdown).toMatch(
      /\| #1204 \| US — Notifications e-mail configurables \| <span class="tag tag-blue">À faire<\/span> \| — \| — \| — \|/
    )

    // Slide epic : avancement basé sur les US du sprint rattachées (0/2 terminées)
    expect(result.markdown).toContain('# 🏔️ Epic #1100 — Epic — Dématérialisation des rapports')
    expect(result.markdown).toContain('Avancement dans ce sprint')
    expect(result.markdown).toContain('0 terminée / 2 US')
    expect(result.markdown).toMatch(
      /\| #1201 \| US — Export PDF des rapports d’audit \| <span class="tag tag-orange">En cours<\/span> \| 1\/2 \|/
    )

    // Sans scan par clone, le camembert cède la place au placeholder explicite
    expect(result.markdown).toContain('Activité des dépôts non mesurée')

    // Le slide code_activity est présent, généré sans LLM, avec les vraies données
    expect(result.markdown).toContain('# 🔀 Activité code — Branches & Pull Requests')
    expect(result.markdown).toContain('`feature/1201-export-pdf` → `main`')
    expect(result.markdown).toContain('Export PDF des rapports (art #1201)')
    expect(result.markdown).toContain('fix(dashboard): guard sur cache vide')
    // Pas de slides par US, d'activité dépôt ni de nouveautés IA sans l'option
    // (le scan par clone n'a pas tourné : aucune stat de dépôt disponible)
    expect(result.markdown).not.toContain('# 📘 US #')
    expect(result.markdown).not.toContain('— activité du sprint')
    expect(result.markdown).not.toContain('nouveautés du sprint')
    // 9 appels LLM (1 synthèse + 8 slides) : les slides déterministes n'en font pas
    expect(llmCalls).toHaveLength(9)

    // Les champs techniques sont filtrés et les références remontent au LLM
    const summaryPromptFields = llmCalls[0].user
    expect(summaryPromptFields).not.toContain('**Rank :**')
    expect(summaryPromptFields).not.toContain('**Last Modified On :**')
    expect(summaryPromptFields).toContain('**Références :** pr #77, git #webapp/bbb222')

    // Le prompt de synthèse contient la hiérarchie, l'activité et le code
    const summaryPrompt = llmCalls[0].user
    expect(summaryPrompt).toContain('### #1201 — US — Export PDF des rapports d’audit')
    expect(summaryPrompt).toContain(
      '#### ↳ #1210 — Générer le PDF côté serveur (lib wkhtmltopdf) _(sous-tâche)_'
    )
    expect(summaryPrompt).toContain('**Dernière mise à jour :** 2026-07-04 par Alice Martin')
    expect(summaryPrompt).toContain('**Branche :** `feature/1201-export-pdf` (dépôt webapp)')
    expect(summaryPrompt).toContain('**Pull request :** PR #77')
    expect(summaryPrompt).toContain('Pull requests en cours (2)')
    expect(summaryPrompt).toContain('Dernières mises à jour (activité récente)')

    // Le prompt risques reçoit l'activité récente et l'activité code
    const risquesPrompt = llmCalls
      .map((c) => c.user)
      .find((u) => u.includes('Risques & Contraintes'))
    expect(risquesPrompt).toContain('=== ACTIVITE RECENTE (dernieres mises a jour) ===')
    expect(risquesPrompt).toContain('=== ACTIVITE CODE (branches & pull requests) ===')
    expect(risquesPrompt).toContain('PR #77')

    // Aucun slide en échec
    expect(result.slideWarnings).toEqual([])

    // Génère l'exemple versionné quand demandé :
    //   WRITE_EXAMPLE=1 npx vitest run tests/generation-pipeline.test.ts
    if (process.env.WRITE_EXAMPLE === '1') {
      const outDir = resolve(__dirname, '../docs/examples')
      mkdirSync(outDir, { recursive: true })
      writeFileSync(resolve(outDir, 'sprint-review-example.md'), result.markdown, 'utf8')
      writeFileSync(
        resolve(outDir, 'sprint-summary-prompt-example.md'),
        `# Exemple de prompt de synthèse (données enrichies)\n\nCe fichier montre les données réellement envoyées au LLM par le pipeline\n(\`sprint_summary\`) après enrichissement : hiérarchie US → sous-tâches,\ndernières mises à jour (changesets), branches Git et pull requests.\nGénéré par \`tests/generation-pipeline.test.ts\` (WRITE_EXAMPLE=1).\n\n---\n\n${llmCalls[0].user}\n`,
        'utf8'
      )
    }
  })
})

// ─── Test d'intégration : option « une slide par US » + scan par clone ──────

describe('runSprintReviewPipeline (storySlides: true, clone mocké)', () => {
  it('génère les slides par US avec critères, tâches, branches (ahead/behind) et PRs', async () => {
    const events: SprintReviewProgressEvent[] = []
    const result = await runSprintReviewPipeline(
      {
        source: { mode: 'sprint', milestoneId: MILESTONE_ID },
        projectName: 'Portail Audit',
        projectId: PROJECT_ID,
        language: 'fr',
        storySlides: true
      },
      (e) => events.push(e)
    )

    // Le scan par clone a été utilisé (une seule fois, tous les repos passés)
    expect(deepScanMock).toHaveBeenCalledTimes(1)
    expect(
      events.filter((e) => e.type === 'code_scan').map((e) => (e as { step: string }).step)
    ).toEqual(['repos', 'clone', 'pull_requests'])

    // Le slide us_story est annoncé entre avancement et code_activity
    const started = events
      .filter((e) => e.type === 'slide_start')
      .map((e) => (e as { slide: string }).slide)
    expect(started).toEqual([
      'titre',
      'contexte',
      'us_recap',
      'epic',
      'equipe',
      'livrables',
      'avancement',
      'us_story',
      'code_activity',
      'repo_activity',
      'repo_news',
      'indicateurs',
      'risques',
      'synthese'
    ])

    // Une slide par US top-level (4 US, les tâches n'ont pas de slide)
    expect(result.markdown).toContain('# 📘 US #1201 — US — Export PDF des rapports d’audit')
    expect(result.markdown).toContain('# 📘 US #1202 — US — Authentification SSO (SAML)')
    expect(result.markdown).toContain('# 📘 US #1203 — Bug — Crash à l’ouverture du dashboard')
    expect(result.markdown).toContain('# 📘 US #1204 — US — Notifications e-mail configurables')
    expect((result.markdown.match(/# 📘 US #/g) ?? []).length).toBe(4)

    // Contenu de la slide US #1201 : texte de l'US tel quel (aucune
    // reformulation « je veux »), critères d'acceptance, effort en heures,
    // badges de références, tâches, branche avec état, PR
    expect(result.markdown).not.toContain('us-quote')
    expect(result.markdown).toContain(
      '## Description\n\nEn tant qu’auditeur, je veux exporter mes rapports en PDF afin de les archiver.'
    )
    expect(result.markdown).toContain("## Critères d'acceptance")
    expect(result.markdown).toContain('Le PDF respecte le gabarit officiel')
    expect(result.markdown).toContain(
      '<span class="effort-chip"><strong>12</strong> h · Effort restant</span>'
    )
    expect(result.markdown).toContain('<span class="tag tag-orange">→ pr #77</span>')
    expect(result.markdown).toContain('<span class="tag tag-green">← git #webapp/bbb222</span>')
    expect(result.markdown).toContain('## Tâches (1/2 terminées)')
    expect(result.markdown).toMatch(/\| #1210 \| Générer le PDF côté serveur/)
    expect(result.markdown).toContain('🌿 `feature/1201-export-pdf` (webapp) — ↑3 ↓1 vs main')
    expect(result.markdown).toContain('🔀 PR #77')
    // Les sections vides ne s'affichent pas : pas de « Pas de description »
    expect(result.markdown).not.toContain('Pas de description')
    expect(result.markdown).not.toContain('Aucune tâche associée')
    // Labels techniques absents des slides US
    expect(result.markdown).not.toContain('Last Modified On')

    // Le donut des commits remplace le placeholder du slide équipe. Marp
    // (allowlist HTML) supprime les attributs style inline : le gradient vit
    // donc dans le CSS du thème (frontmatter), le HTML ne porte que des classes.
    expect(result.markdown).not.toContain('[[ACTIVITE_DEPOTS]]')
    expect(result.markdown).not.toContain('style="')
    const frontmatterEnd = result.markdown.indexOf('---', 4)
    const frontmatter = result.markdown.slice(0, frontmatterEnd)
    expect(frontmatter).toContain('.pie-chart { background: conic-gradient(#1a365d 0.0% 100.0%); }')
    expect(result.markdown).toContain('<div class="pie-chart"></div>')
    expect(result.markdown).toContain('<span class="pie-total">42</span>')
    expect(result.markdown).toContain(
      '<span class="pie-dot pie-c0"></span>webapp — <strong>42</strong> commits (100%)'
    )
    expect(result.markdown).toContain('Commits par dépôt depuis le 2026-06-23')
    // Compteurs ajoutés au slide équipe : branches créées + lignes implémentées
    expect(result.markdown).toContain('<strong>2</strong> branches créées')
    expect(result.markdown).toContain('<strong>+4,2k</strong> lignes implémentées')

    // Slide activité code : colonne État alimentée par le clone
    expect(result.markdown).toContain(
      '| Branche | Artefacts | Dernier commit | Auteur, date | État |'
    )
    expect(result.markdown).toContain('<span class="tag tag-orange">↑3 ↓1</span>')
    expect(result.markdown).toContain('<span class="tag tag-green">Fusionnée / à jour</span>')
    expect(result.markdown).toContain('scan par clone')

    // Slide « nouveautés du dépôt » : générée par IA depuis les git logs
    expect(result.markdown).toContain('# Dépôt webapp — nouveautés du sprint')
    expect(result.markdown).toContain('Prévisualisation des rapports PDF avant export')
    // Le prompt IA reçoit les messages de commits et les fichiers modifiés
    const newsPrompt = llmCalls
      .map((c) => c.user)
      .find((u) => u.includes('MESSAGES DES COMMITS DU SPRINT'))
    expect(newsPrompt).toContain('feat(export): page de prévisualisation PDF (David Roux)')
    expect(newsPrompt).toContain('- src/pdf/render.ts (+1210/−80)')
    expect(newsPrompt).toContain('Commits sur la période : 42')

    // Slide « activité dépôt » : gros chiffres + mind map des branches
    expect(result.markdown).toContain('# Dépôt webapp — activité du sprint')
    expect(result.markdown).toContain('<span class="big-value">42</span>')
    expect(result.markdown).toContain('<span class="big-value">87</span>')
    expect(result.markdown).toContain('<span class="big-value">+4,2k / −1,2k</span>')
    expect(result.markdown).toContain('Branches actives · 2 nouvelles')
    expect(result.markdown).toContain('class="mindmap"')
    expect(result.markdown).toContain('<span class="mm-root-name">webapp</span>')
    expect(result.markdown).toMatch(
      /<div class="mm-node is-new">\s*<span class="mm-count">12<\/span>\s*<span class="mm-branch-info">\s*<span class="mm-branch-name">feature\/1201-export-pdf<\/span>/
    )
    expect(result.markdown).toContain('<span class="mm-badge">nouvelle</span>')
    expect(result.markdown).toContain('<span class="mm-badge is-def">défaut</span>')

    // 10 appels LLM : 1 synthèse + 8 slides + 1 « nouveautés » par dépôt actif
    expect(llmCalls).toHaveLength(10)
    expect(result.slideWarnings).toEqual([])

    if (process.env.WRITE_EXAMPLE === '1') {
      const outDir = resolve(__dirname, '../docs/examples')
      mkdirSync(outDir, { recursive: true })
      writeFileSync(
        resolve(outDir, 'sprint-review-story-slides-example.md'),
        result.markdown,
        'utf8'
      )
    }
  })
})

// ─── Sprints imbriqués ───────────────────────────────────────────────────────

describe('listMilestonesWithChildren (sprints imbriqués)', () => {
  it('descend dans les sous-milestones et renseigne depth/parentId', async () => {
    const sprints = await listMilestonesWithChildren(fakeClient, PROJECT_ID, 'all')
    expect(sprints.map((s) => s.id)).toEqual([900, 901, MILESTONE_ID])
    const nested = sprints.find((s) => s.id === 901)
    expect(nested?.parentId).toBe(900)
    expect(nested?.depth).toBe(1)
    expect(sprints.find((s) => s.id === 900)?.depth).toBe(0)
  })

  it('garde une release close quand un sprint enfant matche le filtre « open »', async () => {
    const sprints = await listMilestonesWithChildren(fakeClient, PROJECT_ID, 'open')
    // Release 900 close conservée (porte le sprint ouvert 901), sprint 850 ouvert conservé
    expect(sprints.map((s) => s.id)).toEqual([900, 901, MILESTONE_ID])
  })

  it('filtre les enfants qui ne matchent pas le statut', async () => {
    const sprints = await listMilestonesWithChildren(fakeClient, PROJECT_ID, 'closed')
    // Seule la release 900 est close ; le sprint imbriqué 901 (ouvert) est exclu
    expect(sprints.map((s) => s.id)).toEqual([900])
  })
})

// ─── Pagination du récapitulatif US ──────────────────────────────────────────

describe('buildUsRecapSlides (pagination)', () => {
  function makeCtx(storyCount: number): Parameters<typeof buildUsRecapSlides>[0] {
    const artifacts = Array.from({ length: storyCount }, (_, i) => ({
      id: 100 + i,
      title: `Story ${i + 1}`,
      status: 'En cours',
      uri: '',
      htmlUrl: null,
      submittedBy: null,
      submittedOn: null,
      lastModified: null,
      trackerId: 1
    }))
    return {
      projectName: 'P',
      label: 'S',
      trackerLabel: null,
      milestone: null,
      artifacts,
      detailedArtifacts: [],
      childArtifactIds: new Set<number>(),
      childrenByParent: new Map(),
      lastUpdates: new Map(),
      codeActivity: {
        reposScanned: 0,
        branchesScanned: 0,
        branches: [],
        pullRequests: [],
        warnings: []
      },
      epics: [],
      storySlides: false,
      language: 'fr' as const,
      generatedAt: '2026-07-08'
    }
  }

  it('tient sur une slide quand il y a peu de stories', () => {
    const slides = buildUsRecapSlides(makeCtx(5))
    expect(slides).toHaveLength(1)
    expect(slides[0]).toContain('# 📋 Récapitulatif des user stories\n')
  })

  it('coupe le tableau en plusieurs slides quand il déborde', () => {
    const slides = buildUsRecapSlides(makeCtx(16))
    expect(slides).toHaveLength(3) // 7 + 7 + 2
    expect(slides[0]).toContain('Récapitulatif des user stories (1/3)')
    expect(slides[2]).toContain('Récapitulatif des user stories (3/3)')
    // La stat-bar n'apparaît que sur la première slide
    expect(slides[0]).toContain('stat-bar')
    expect(slides[1]).not.toContain('stat-bar')
    // Toutes les stories sont présentes, réparties sur les pages
    const all = slides.join('\n')
    expect(all).toContain('| #100 |')
    expect(all).toContain('| #115 |')
  })
})

// ─── Formatters ──────────────────────────────────────────────────────────────

describe('formatters activité', () => {
  it('formatCodeActivityBlock rend un bloc vide lisible', () => {
    expect(formatCodeActivityBlock(undefined)).toContain('Aucune branche ni pull request')
  })

  it('formatRecentUpdatesBlock trie par date décroissante', () => {
    const updates = new Map([
      [1, { date: '2026-07-01T10:00:00Z', author: 'A', comment: null, changesetCount: 1 }],
      [2, { date: '2026-07-05T10:00:00Z', author: 'B', comment: 'ok', changesetCount: 1 }]
    ])
    const artifacts = [
      {
        id: 1,
        title: 'Un',
        status: 'En cours',
        uri: '',
        htmlUrl: null,
        submittedBy: null,
        submittedOn: null,
        lastModified: null,
        trackerId: 1
      },
      {
        id: 2,
        title: 'Deux',
        status: 'Terminé',
        uri: '',
        htmlUrl: null,
        submittedBy: null,
        submittedOn: null,
        lastModified: null,
        trackerId: 1
      }
    ]
    const block = formatRecentUpdatesBlock(artifacts, updates)
    const lines = block.split('\n')
    expect(lines[0]).toContain('#2 Deux')
    expect(lines[1]).toContain('#1 Un')
  })
})
