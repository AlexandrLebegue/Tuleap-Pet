# Tuleap AI Companion

Application desktop **Electron** qui se branche sur une instance Tuleap et offre un compagnon IA local-first pour les équipes ALM. Architecture pensée pour tourner 100 % en local : LLM via Ollama par défaut, OpenAI/Anthropic en option via env vars.

> Statut actuel : **Phase 0 — Fondations**. Connexion Tuleap par token API, sélection d'un projet, parcours des trackers et artéfacts. Les phases IA (génération de slides, chatbot, Coder via OpenCode) arrivent ensuite.

## Stack

- Electron 39 + electron-vite v5
- React 19 + TypeScript strict
- Tailwind CSS v4 + shadcn/ui (style new-york)
- React Router v7 (HashRouter)
- Zustand pour le state global du renderer
- Zod pour valider les réponses Tuleap
- electron-store v8 (config), `safeStorage` (token chiffré), better-sqlite3 (audit log)
- Vitest pour les tests

## Prérequis

- **Node.js 20+** (testé sur Node 22)
- npm 10+
- Une instance Tuleap accessible et un **token API personnel**
  - Sur [tuleap.net](https://tuleap.net) : *Account → Preferences → Access Keys → Generate*

Phases ultérieures (pas nécessaires pour la Phase 0) :

- **Ollama** local pour le LLM par défaut (Phase 1+)
- **marp-cli** pour la génération PPTX (Phase 1)
- **OpenCode** pour l'agent Coder (Phase 3)

## Démarrer en dev

```bash
npm install      # installe + electron-builder install-app-deps (rebuild natifs)
npm run dev      # ouvre la fenêtre avec HMR
```

Au premier lancement, allez dans **Réglages** :

1. Saisissez l'URL de votre instance (`https://tuleap.net` par défaut) → *Enregistrer*.
2. Collez votre token API → *Enregistrer* (chiffré localement via `safeStorage`).
3. *Tester la connexion* → vérifie `GET /api/users/self`.
4. *Charger les projets accessibles* → choisissez votre projet de travail.
5. Onglet **Projet** : trackers, artéfacts paginés, drawer de détail avec parents/enfants.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Mode dev avec HMR |
| `npm run build` | Typecheck + bundle production (`out/`) |
| `npm run build:linux` / `:mac` / `:win` | Bundle puis package via electron-builder |
| `npm run typecheck` | Typecheck node + web |
| `npm run lint` | ESLint (cache activé) |
| `npm run format` | Prettier |
| `npm test` | Tests vitest |
| `npm run test:watch` | Tests en mode watch |

## Sécurité

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` sur la fenêtre principale
- CSP stricte dans `src/renderer/index.html` (`object-src 'none'`, `form-action 'none'`, `base-uri 'self'`)
- Token Tuleap chiffré sur disque via `safeStorage`, jamais renvoyé au renderer (le renderer voit uniquement `hasToken: boolean`)
- Toutes les requêtes Tuleap passent par le main process via IPC ; le renderer ne contacte aucun host externe (CSP `connect-src 'self'`)
- Audit log local des actions IPC dans une base SQLite (`audit_log`) — utile pour la conformité côté industries régulées

## Architecture (Phase 0)

```
src/
├── main/                          # Process Node.js
│   ├── index.ts                   # Bootstrap BrowserWindow
│   ├── ipc/                       # Handlers ipcMain.handle
│   ├── tuleap/                    # Client REST + Zod + erreurs typées
│   └── store/                     # config, secrets (safeStorage), db (better-sqlite3)
├── preload/                       # contextBridge.exposeInMainWorld('api', ...)
├── renderer/src/
│   ├── App.tsx                    # Layout + RouterProvider
│   ├── routes/                    # Réglages, Projet, + 4 placeholders Phase 1-4
│   ├── components/                # Sidebar, ConnectionStatusBadge, TrackerList, …
│   ├── components/ui/             # shadcn primitives (button, input, label, card, badge)
│   ├── stores/                    # Zustand (settings, project)
│   └── lib/                       # api typé, cn() helper
└── shared/                        # Types partagés main ↔ renderer
```

Voir [`docs/architecture.md`](docs/architecture.md) pour les flux IPC détaillés.

## Phasage du projet

- **Phase 0 — Fondations** ✅ (cette release)
- **Phase 1 — Génération IA** : Vercel AI SDK + Ollama, Marp → PPTX
- **Phase 2 — Chatbot avec tools Tuleap** : function calling, streaming, persistance SQLite
- **Phase 3 — OAuth2 + Coder** : OAuth2 desktop + OpenCode en sous-processus
- **Phase 4 — Admin** : monitor IA, à scoper

Backlog d'idées hors-scope : [`docs/backlog.md`](docs/backlog.md).
