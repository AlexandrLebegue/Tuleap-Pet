# Tuleap AI Companion

Application desktop **Electron** qui se branche sur une instance Tuleap et offre un compagnon IA local-first pour les équipes ALM. Provider LLM enfichable : la Phase 1+ utilise **OpenRouter** (clé API ; modèle par défaut `minimax/minimax-m2:free`), Ollama / OpenAI / Anthropic suivront le même contrat.

> Statut actuel : **Phases 0 → 4 livrées + Phases 5-10 (features Dev × Tuleap)**.
>
> - Phase 0 : connexion Tuleap (token API), sélection projet, parcours trackers/artéfacts.
> - Phase 1 : génération de sprint reviews Markdown Marp + export PPTX via OpenRouter.
> - Phase 2 : chatbot avec tools Tuleap (function calling, streaming, persistance SQLite).
> - Phase 3 : OAuth2 + PKCE comme alternative au token, lancement OpenCode (Coder).
> - Phase 4 : monitor admin (scan d'activité + synthèse IA).
> - **Phases 5-10** : Sprint Board + Backlog, Ticket → Branche, PR ↔ AC, Knowledge Base (RAG), Release Notes, Sprint Planning, Bug Repro, Code → Tuleap Traceability, **write tools chatbot (avec confirm modal)**.

## Stack

- Electron 39 + electron-vite v5
- React 19 + TypeScript strict
- Tailwind CSS v4 + shadcn/ui (style new-york)
- React Router v7 (HashRouter)
- Zustand pour le state global du renderer
- Zod pour valider les réponses Tuleap et les tools
- electron-store v8 (config), `safeStorage` (token + clé OpenRouter + bundle OAuth2 chiffrés), better-sqlite3 (audit log + conversations)
- Vercel AI SDK v6 + `@openrouter/ai-sdk-provider` (function calling, streaming)
- `@marp-team/marp-core` (preview HTML) + `@marp-team/marp-cli` (export PPTX) + `puppeteer` (Chromium)
- Vitest pour les tests

## Prérequis

- **Node.js 20+** (testé sur Node 22)
- npm 10+
- Une instance Tuleap accessible et soit :
  - un **token API personnel** (Tuleap → *Account → Preferences → Access Keys → Generate*), soit
  - une **application OAuth2** enregistrée par un admin (avec `redirect_uri` autorisant les loopbacks `http://127.0.0.1:*`)
- Une **clé API OpenRouter** ([openrouter.ai/keys](https://openrouter.ai/keys))
  - Le modèle par défaut `minimax/minimax-m2:free` est gratuit (rate-limité), tout slug OpenRouter est accepté.
- **Chromium** pour l'export PPTX :
  - `npm install` télécharge automatiquement le Chromium fourni par puppeteer (~270 MB)
  - Alternative : exporter `MARP_CHROME_PATH` ou `CHROME_PATH` vers un Chrome système.
- **OpenCode** pour l'onglet Coder (Phase 3) — optionnel : [opencode.ai](https://opencode.ai/)

## Démarrer en dev

```bash
npm install      # installe + electron-builder install-app-deps + Chromium puppeteer
npm run dev      # ouvre la fenêtre avec HMR
```

Au premier lancement, allez dans **Réglages** :

1. Saisissez l'URL Tuleap (`https://tuleap.net` par défaut) → *Enregistrer*.
2. Choisissez le mode d'authentification :
   - **Token API personnel** (par défaut) : collez votre token.
   - **OAuth2 + PKCE** : renseignez le client_id de l'app et cliquez *Se connecter via OAuth2* — un onglet navigateur s'ouvre, vous consentez, le token est récupéré via un serveur loopback éphémère puis chiffré.
3. *Tester la connexion* → `GET /api/users/self`.
4. *Charger les projets accessibles* → choisissez votre projet de travail.
5. Saisissez votre clé OpenRouter (ou exportez `OPENROUTER_API_KEY` avant de lancer `npm run dev`).
6. *Tester le LLM* → fait un appel court au modèle.

Onglets disponibles :

| Onglet | Phase | Description |
|---|---|---|
| **Réglages** | 0 | URL Tuleap, auth, projet, clé OpenRouter, modèle |
| **Projet** | 0 | Trackers, artéfacts paginés, panneau de détail |
| **Génération IA** | 1 | Sprint review Marp → PPTX |
| **Chatbot** | 2 | Conversations persistantes avec tools Tuleap (lecture + écritures avec confirm) |
| **Coder** | 3 | Construction de contexte Tuleap → lancement OpenCode |
| **Admin** | 4 | Scan d'activité + synthèse IA |
| **Sprint Board** | 5 | Backlog + Kanban par workflow + scan risques IA |
| **Ticket → Branche** | 5 | Crée la branche git, scaffold commit+PR, commente l'artéfact |
| **PR ↔ AC** | 5 | Vérifie acceptance criteria contre le diff d'une PR |
| **Knowledge Base** | 5 | Indexe artéfacts fermés (FTS5) + recherche full-text |
| **Release Notes** | 5 | git log + artéfacts résolus → changelog Markdown |
| **Sprint Planning** | 5 | Vélocité + composition de sprint avec IA |
| **Bug Repro** | 5 | Bug Tuleap + repo → test unitaire qui échoue |
| **Traceability** | 5 | Historique d'un fichier ↔ artéfacts Tuleap référencés |

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
- Token Tuleap, clé OpenRouter ET bundle OAuth2 (access + refresh) chiffrés sur disque via `safeStorage` ; jamais renvoyés au renderer (le renderer voit `hasToken`, `hasLlmKey`, `hasOAuth: boolean`)
- OAuth2 flow PKCE S256, redirect via loopback éphémère sur 127.0.0.1, validation du paramètre `state`
- Toutes les requêtes Tuleap **et** LLM passent par le main process via IPC ; le renderer ne contacte aucun host externe (CSP `connect-src 'self'`)
- L'aperçu Marp est rendu dans un `<iframe sandbox="" srcDoc>` avec sa propre CSP `default-src 'none'` — la sortie LLM est traitée comme non-fiable même après sanitisation par `marp-core`
- Tools Tuleap exposés au LLM (Phase 2) : 6 endpoints **read-only** uniquement (get_self, list_projects, list_trackers, list_artifacts, get_artifact, list_milestones). Les écritures sont volontairement laissées hors-scope tant qu'il n'y a pas d'UI de confirmation/diff.
- OpenCode (Phase 3) est lancé en `child_process.spawn` sans shell (`shell: false`) — pas d'injection possible sur les arguments
- Audit log local des actions IPC dans une base SQLite (`audit_log`) — chaque appel Tuleap, chaque appel LLM, chaque tool, chaque export PPTX, chaque scan admin, chaque spawn OpenCode y est tracé

## Architecture

```
src/
├── main/                          # Process Node.js
│   ├── index.ts                   # Bootstrap BrowserWindow
│   ├── ipc/                       # Handlers ipcMain.handle
│   │   ├── settings.ts            # Tuleap URL / projet / OpenRouter key+modèle
│   │   ├── auth.ts                # OAuth2 flow IPC (start, clear, mode)
│   │   ├── tuleap.ts              # Connexion, projets, trackers, artéfacts
│   │   ├── generation.ts          # Sprints + sprint review
│   │   ├── marp.ts                # Preview + export PPTX
│   │   ├── chat.ts                # Conversations, streaming, tool events
│   │   ├── coder.ts               # OpenCode subprocess + chooseCwd
│   │   └── admin.ts               # Scan + LLM digest
│   ├── auth/                      # PKCE + loopback server + token resolver
│   ├── tuleap/                    # Client REST + Zod + erreurs typées + buildClient
│   ├── llm/                       # LlmProvider abstraction + OpenRouter + tools
│   ├── prompts/                   # Loader + sprint_review + admin_summary
│   ├── marp/                      # Preview HTML + export PPTX (marp-cli)
│   ├── chat/                      # Conversation manager (better-sqlite3)
│   ├── coder/                     # Context builder + spawn runner
│   ├── admin/                     # Activity scanner
│   └── store/                     # config, secrets (safeStorage), db (sqlite)
├── preload/                       # contextBridge.exposeInMainWorld('api', ...)
├── renderer/src/
│   ├── App.tsx                    # Layout + RouterProvider
│   ├── routes/                    # Réglages, Projet, Génération, Chatbot, Coder, Admin
│   ├── components/                # Sidebar, ConnectionStatusBadge, ChatMessageBubble, MarpPreviewFrame, ...
│   ├── components/ui/             # shadcn primitives
│   ├── stores/                    # Zustand (settings, project, generation, chat, coder)
│   └── lib/                       # api typé, cn() helper
├── shared/                        # Types partagés main ↔ renderer
└── docs/prompts/                  # Templates de prompts versionnés (bundle via Vite ?raw)
    ├── sprint_review.md
    └── admin_summary.md
```

Voir [`docs/architecture.md`](docs/architecture.md) pour les flux IPC et de sécurité détaillés.

## Tests

64 tests vitest couvrent :

- TuleapClient (auth header, pagination, erreurs HTTP, schéma Zod)
- Mappers (project / tracker / artefact / milestone)
- Sprint review (interpolate, bucketArtifacts, buildMessages)
- Admin summary (interpolation tracker/sprint lines, fallbacks vides)
- Marp preview (CSP inline, sandbox, multi-slides)
- LLM erreurs (auth, rate-limit, network, schéma)
- Chat tools (Zod schemas, names) + chat manager (SQLite in-memory)
- PKCE (verifier 43 chars, S256 deterministic, RFC 7636 vector)
- Coder context formatter (champ description, liens, troncature 600)

```bash
npm test
```

## Backlog hors-scope

Voir [`docs/backlog.md`](docs/backlog.md).
