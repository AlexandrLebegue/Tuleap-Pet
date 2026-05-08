# Tuleap AI Companion

Application desktop **Electron** qui se branche sur une instance Tuleap et offre un compagnon IA local-first pour les équipes ALM. Provider LLM enfichable : la Phase 1 utilise **OpenRouter** (clé API ; modèle par défaut `minimax/minimax-m2:free`), Ollama / OpenAI / Anthropic suivront le même contrat.

> Statut actuel : **Phase 1 — Génération IA**. Connexion Tuleap, parcours du projet (Phase 0) + sélection d'un sprint, génération d'un sprint review en Markdown Marp via OpenRouter, aperçu live et export PPTX via marp-cli.

## Stack

- Electron 39 + electron-vite v5
- React 19 + TypeScript strict
- Tailwind CSS v4 + shadcn/ui (style new-york)
- React Router v7 (HashRouter)
- Zustand pour le state global du renderer
- Zod pour valider les réponses Tuleap
- electron-store v8 (config), `safeStorage` (token + clé OpenRouter chiffrés), better-sqlite3 (audit log)
- Vercel AI SDK v6 + `@openrouter/ai-sdk-provider`
- `@marp-team/marp-core` (preview HTML) + `@marp-team/marp-cli` (export PPTX) + `puppeteer` (Chromium pour le rendu)
- Vitest pour les tests

## Prérequis

- **Node.js 20+** (testé sur Node 22)
- npm 10+
- Une instance Tuleap accessible et un **token API personnel**
  - Sur [tuleap.net](https://tuleap.net) : *Account → Preferences → Access Keys → Generate*
- Une **clé API OpenRouter** ([openrouter.ai/keys](https://openrouter.ai/keys))
  - Le modèle par défaut `minimax/minimax-m2:free` est gratuit (rate-limité), tout slug OpenRouter est accepté.
- **Chromium** pour l'export PPTX :
  - `npm install` télécharge automatiquement le Chromium fourni par puppeteer (~270 MB)
  - Alternative : exporter `MARP_CHROME_PATH` ou `CHROME_PATH` vers un Chrome système.

Phases ultérieures (pas nécessaires pour Phase 1) : **OpenCode** pour l'agent Coder (Phase 3).

## Démarrer en dev

```bash
npm install      # installe + electron-builder install-app-deps + Chromium puppeteer
npm run dev      # ouvre la fenêtre avec HMR
```

Au premier lancement, allez dans **Réglages** :

1. Saisissez l'URL Tuleap (`https://tuleap.net` par défaut) → *Enregistrer*.
2. Collez votre token API Tuleap → *Enregistrer* (chiffré via `safeStorage`).
3. *Tester la connexion* → `GET /api/users/self`.
4. *Charger les projets accessibles* → choisissez votre projet de travail.
5. Saisissez votre clé OpenRouter (ou exportez `OPENROUTER_API_KEY` avant de lancer `npm run dev`).
6. *Tester le LLM* → fait un appel court au modèle pour vérifier la clé.
7. Onglet **Projet** : trackers, artéfacts paginés, panneau de détail.
8. Onglet **Génération IA** :
   - Choisissez un sprint (statut ouvert / clos / tous)
   - *Générer en français* → l'IA produit du Markdown Marp à partir de `docs/prompts/sprint_review.md`
   - Éditez le Markdown si besoin (l'aperçu Marp se rafraîchit en quittant la zone de texte)
   - *Exporter en .pptx* → boîte de dialogue native, fichier généré par marp-cli.

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
- Token Tuleap **et** clé OpenRouter chiffrés sur disque via `safeStorage`, jamais renvoyés au renderer (le renderer voit uniquement `hasToken` / `hasLlmKey: boolean`)
- Toutes les requêtes Tuleap **et** LLM passent par le main process via IPC ; le renderer ne contacte aucun host externe (CSP `connect-src 'self'`)
- L'aperçu Marp est rendu dans un `<iframe sandbox="" srcDoc>` avec sa propre CSP `default-src 'none'` — la sortie LLM est traitée comme non-fiable même après sanitisation par `marp-core`
- Audit log local des actions IPC dans une base SQLite (`audit_log`) — chaque appel Tuleap, chaque appel LLM, chaque export PPTX y est tracé

## Architecture (Phase 0 + Phase 1)

```
src/
├── main/                          # Process Node.js
│   ├── index.ts                   # Bootstrap BrowserWindow
│   ├── ipc/                       # Handlers ipcMain.handle
│   │   ├── settings.ts            # Tuleap URL/token + LLM key/model
│   │   ├── tuleap.ts              # Connexion, projets, trackers, artéfacts
│   │   ├── generation.ts          # Sprints, génération sprint review
│   │   └── marp.ts                # Preview + export PPTX
│   ├── tuleap/                    # Client REST + Zod + erreurs typées
│   ├── llm/                       # LlmProvider abstraction + impl OpenRouter
│   ├── prompts/                   # Loader + builders des prompts
│   ├── marp/                      # Preview HTML + export PPTX (marp-cli)
│   └── store/                     # config, secrets (safeStorage), db (sqlite)
├── preload/                       # contextBridge.exposeInMainWorld('api', ...)
├── renderer/src/
│   ├── App.tsx                    # Layout + RouterProvider
│   ├── routes/                    # Réglages, Projet, Génération IA, …
│   ├── components/                # Sidebar, MarpPreviewFrame, …
│   ├── components/ui/             # shadcn primitives
│   ├── stores/                    # Zustand (settings, project, generation)
│   └── lib/                       # api typé, cn() helper
├── shared/                        # Types partagés main ↔ renderer
└── docs/prompts/                  # Templates de prompts versionnés
    └── sprint_review.md           # bundle via Vite ?raw
```

Voir [`docs/architecture.md`](docs/architecture.md) pour les flux IPC détaillés.

## Phasage du projet

- **Phase 0 — Fondations** ✅
- **Phase 1 — Génération IA** ✅ (cette release) — sprint review Marp → PPTX via OpenRouter
- **Phase 2 — Chatbot avec tools Tuleap** : function calling, streaming, persistance SQLite
- **Phase 3 — OAuth2 + Coder** : OAuth2 desktop + OpenCode en sous-processus
- **Phase 4 — Admin** : monitor IA, à scoper

Backlog d'idées hors-scope : [`docs/backlog.md`](docs/backlog.md).
