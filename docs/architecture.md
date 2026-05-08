# Architecture — Tuleap AI Companion

## Process Electron

```
┌────────────────────┐      contextBridge       ┌────────────────────┐
│   Main process     │ ◄──── IPC ──── ipcMain   │   Renderer (React) │
│   (Node 22)        │                          │   sandbox: true    │
│                    │                          │                    │
│  store/config.ts   │                          │  routes/Settings   │
│  store/secrets.ts  │                          │  routes/Project    │
│  store/db.ts       │                          │  stores/*.ts       │
│  tuleap/client.ts  │                          │  components/ui/*   │
│  ipc/settings.ts   │                          │                    │
│  ipc/tuleap.ts     │                          │                    │
└────────┬───────────┘                          └─────────┬──────────┘
         │                                                │
         │ window.api.{settings,tuleap}                   │
         ▼                                                │
┌────────────────────┐                                    │
│  Preload (CJS)     │ ◄──────── contextBridge ───────────┘
│  src/preload/      │
│  index.ts          │
└────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────┐
│ Tuleap REST API (HTTPS) — ne sort jamais du main process   │
└────────────────────────────────────────────────────────────┘
```

Le renderer n'effectue **aucun** appel sortant. Tout passe par le preload bridge → IPC → main → fetch.

## IPC surface (Phases 0 → 4)

### Settings + auth

| Canal | Payload | Réponse |
|---|---|---|
| `settings:get` | — | `SettingsState` |
| `settings:set-tuleap-url` | `string \| null` | `SettingsState` |
| `settings:set-token` | `string` (jamais retourné) | `SettingsState` |
| `settings:clear-token` | — | `SettingsState` |
| `settings:set-project-id` | `number \| null` | `SettingsState` |
| `settings:set-llm-key` | `string` (jamais retourné) | `SettingsState` |
| `settings:clear-llm-key` | — | `SettingsState` |
| `settings:set-llm-model` | `string \| null` | `SettingsState` |
| `settings:reset` | — | `SettingsState` |
| `auth:set-mode` | `'token' \| 'oauth2'` | `{ ok }` |
| `auth:set-oauth-client` | `{ clientId, scope }` | `{ ok }` |
| `auth:start-oauth` | — | `StartOAuthResult` (ok / error) |
| `auth:clear-oauth` | — | `{ ok }` |
| `auth:has-oauth` | — | `{ hasOAuth }` |

### Tuleap (Phase 0)

| Canal | Payload | Réponse |
|---|---|---|
| `tuleap:test-connection` | — | `ConnectionTestResult` |
| `tuleap:list-projects` | `string?` (query) | `ProjectSummary[]` |
| `tuleap:list-trackers` | `number?` | `TrackerSummary[]` |
| `tuleap:list-artifacts` | `{ trackerId, limit?, offset? }` | `Page<ArtifactSummary>` |
| `tuleap:get-artifact` | `number` | `ArtifactDetail` |

### Génération (Phase 1)

| Canal | Payload | Réponse |
|---|---|---|
| `generation:list-sprints` | `MilestoneStatus?` (`'open'`) | `MilestoneSummary[]` |
| `generation:get-sprint-content` | `number` | `SprintContent` |
| `generation:test-llm` | — | `LlmTestResult` |
| `generation:generate-sprint-review` | `{ milestoneId, language? }` | `{ markdown, model, finishReason, usage }` |
| `marp:render-preview` | `string` (markdown) | `{ html }` (sandboxed) |
| `marp:export-pptx` | `{ markdown, suggestedName? }` | `MarpExportResult` |

### Chat (Phase 2)

| Canal | Payload | Réponse |
|---|---|---|
| `chat:list-conversations` | — | `ChatConversation[]` |
| `chat:get-conversation` | `number` | `{ conversation, messages }` |
| `chat:create-conversation` | `{ title?, projectId? }` | `ChatConversation` |
| `chat:rename-conversation` | `{ id, title }` | `ChatConversation \| null` |
| `chat:delete-conversation` | `number` | `{ ok }` |
| `chat:send-message` | `{ conversationId, content }` | `ChatSendResult` |
| `chat:stream` (event) | — | `ChatStreamEvent` (started / delta / tool-call / tool-result / done / error) |

### Coder (Phase 3)

| Canal | Payload | Réponse |
|---|---|---|
| `coder:build-context` | `number` (artifactId) | `CoderContextResult` |
| `coder:set-binary` | `{ path }` | `{ ok, path }` |
| `coder:choose-cwd` | — | `{ ok, path } \| { ok: false, cancelled }` |
| `coder:run` | `{ prompt, cwd?, binaryPath?, extraArgs? }` | `{ ok, sessionId, pid } \| { ok: false, error }` |
| `coder:kill` | `string` (sessionId) | `{ ok }` |
| `coder:stream` (event) | — | `CoderStreamEvent` (started / stdout / stderr / exit / error) |

### Admin (Phase 4)

| Canal | Payload | Réponse |
|---|---|---|
| `admin:scan` | `{ windowDays? }` | `AdminScanResult` |
| `admin:summarize` | `AdminScanResult` | `AdminSummaryResult` |

`SettingsState` ne contient JAMAIS de secret en clair — uniquement des booléens (`hasToken`, `hasLlmKey`, `hasOAuth`, `llmKeyFromEnv`) qui décrivent la présence des secrets sans en révéler la valeur.

## Stockage

| Donnée | Emplacement | Format |
|---|---|---|
| URL Tuleap, projectId, modèle LLM, mode auth, client OAuth2, binaire OpenCode | `<userData>/config.json` (electron-store) | JSON |
| Token API perso Tuleap | `<userData>/secrets/tuleap-token.bin` | Buffer chiffré via `safeStorage` |
| Clé API OpenRouter | `<userData>/secrets/openrouter-key.bin` | Buffer chiffré via `safeStorage` |
| Bundle OAuth2 (access + refresh + expiresAt + scope) | `<userData>/secrets/tuleap-oauth.bin` | JSON sérialisé puis chiffré via `safeStorage` |
| Audit log + conversations + messages | `<userData>/data/tuleap-companion.db` | SQLite (migrations #1 + #2) |
| Templates de prompts | bundlés via Vite `?raw` depuis `docs/prompts/*.md` | (read-only à l'exécution) |

`<userData>` est résolu par Electron : `~/.config/tuleap-ai-companion/` sur Linux, etc.

## Sécurité — checklist

- [x] `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- [x] `webSecurity: true`, `allowRunningInsecureContent: false`
- [x] CSP stricte (`object-src 'none'`, `base-uri 'self'`, `form-action 'none'`)
- [x] Token chiffré via `safeStorage`, jamais loggué, jamais exposé au renderer
- [x] Validation Zod sur **toutes** les réponses Tuleap avant de les passer au renderer
- [x] URL Tuleap normalisée (trim trailing slashes, exige `http(s)://`)
- [x] Audit log de chaque appel sortant vers Tuleap

## Flux type : « tester la connexion »

```
Settings.tsx                     window.api.tuleap.testConnection()
       │
       ▼
preload/index.ts                 ipcRenderer.invoke('tuleap:test-connection')
       │
       ▼
ipc/tuleap.ts                    buildClient() {
                                   getConfig().tuleapUrl
                                   getTuleapToken()        // safeStorage.decryptString
                                 }
                                 await client.getSelf()
                                 audit('tuleap.test-connection')
       │
       ▼
tuleap/client.ts                 fetch(`${baseUrl}/api/users/self`,
                                   { headers: { 'X-Auth-AccessKey': … } })
                                 → schema.safeParse → throw Tuleap*Error si invalide
       │
       ▼
catch dans ipc/tuleap.ts         toConnectionResult(err) → ConnectionTestResult
       │
       ▼ (sérialisé via IPC)
useSettings.testConnection       set({ status: 'ok' | 'error', lastResult })
       │
       ▼
ConnectionStatusBadge            Badge variant="success" / "destructive"
```

## Erreurs

`src/main/tuleap/errors.ts` définit une hiérarchie typée :

- `TuleapAuthError` — 401 / 403
- `TuleapNotFoundError` — 404
- `TuleapServerError` — autre 4xx / 5xx
- `TuleapNetworkError` — fetch a throw (timeout, DNS, TLS…)
- `TuleapSchemaError` — Zod a rejeté la réponse

L'IPC handler `tuleap:test-connection` mappe ces erreurs vers un `ConnectionTestResult` (discriminated union) — pour les autres canaux, l'erreur est simplement re-jetée via `ipcRenderer.invoke` et reçue côté renderer comme `Error`.

`src/main/llm/errors.ts` définit une hiérarchie symétrique pour le LLM :

- `LlmAuthError` — 401 / 403 (clé refusée par OpenRouter)
- `LlmRateLimitError` — 429
- `LlmNetworkError` — fetch a throw
- `LlmError` — autres erreurs HTTP ou inconnues

`generation:test-llm` les mappe vers un `LlmTestResult` (discriminated union).

## Pipeline Génération IA (Phase 1)

```
Generation.tsx                   selectSprint() puis generate('fr')
       │
       ▼
ipc/generation.ts                client.getProject(projectId)
                                 client.getMilestone(milestoneId)
                                 client.listMilestoneContent(milestoneId, limit=200)
                                 buildSprintReviewMessages({ projectName, milestone, artifacts })
                                 resolveLlmProvider().generate({ messages, temp=0.3 })
       │
       ▼
prompts/sprint-review.ts         bucketArtifacts() → done/in-progress/todo
                                 interpolate(userTemplate, vars)
       │
       ▼
llm/openrouter.ts                generateText({ model: openrouter(slug), messages })
                                 → AI SDK v6 → OpenRouter REST
       │
       ▼ (markdown Marp)
ipc/marp.ts                      renderMarpPreview() → HTML sandboxed
                                 (à l'export) exportMarpPptx() → marp-cli (Chromium puppeteer)
                                                        → dialog.showSaveDialog()
       │
       ▼
MarpPreviewFrame                 <iframe sandbox="" srcDoc={html}>
```

Chaque étape (start, done, marp.export-pptx) émet une ligne `audit_log`.

## Pipeline Chat (Phase 2)

```
ChatTab.tsx                      send() → ipcRenderer.invoke('chat:send-message')
       │
       ▼
ipc/chat.ts                      addMessage(user) puis addMessage(assistant, '')
                                 broadcast('started', { assistantMessageId })
                                 provider.stream(messages + tools, onChunk)
       │
       ▼ (chunk après chunk)
llm/openrouter.ts                streamText(...).fullStream
                                   ├─ text-delta → broadcast('delta')
                                   ├─ tool-call  → broadcast('tool-call')  + appendToolEvent
                                   ├─ tool-result → broadcast('tool-result') + appendToolEvent
                                   └─ finish     → broadcast('done')
       │
       ▼
chat manager                     updateMessageContent(id, finalText)
                                 audit('chat.message.done', { usage })
       │
       ▼ (event sur 'chat:stream')
useChat.handleEvent              applique delta sur le bubble assistant en cours
```

## Authentification (Phases 0 + 3)

Deux modes coexistent, sélectionnables dans Réglages :

```
Mode 'token' (défaut)            Mode 'oauth2' (Phase 3)
       │                                │
       ▼                                ▼
secrets/tuleap-token.bin         auth/oauth.ts → runOAuthFlow()
(safeStorage)                       │  loopback HTTP + shell.openExternal
                                    │  PKCE S256 + state validation
                                    │  POST /oauth2/token
                                    ▼
                                 secrets/tuleap-oauth.bin (access + refresh + exp)
                                    │
                                    ▼
                                 resolver.ts auto-refresh à 60s du expiry
       │                                │
       └────────────┬───────────────────┘
                    ▼
        tuleap/build.ts (async)
                    │
                    ▼
           TuleapClient { authHeader: 'X-Auth-AccessKey' | 'Authorization' }
```

## Coder (Phase 3)

```
Coder.tsx                        build() → coder:build-context(id)
       │                          → buildArtifactContext = client.getArtifact + formatArtifactContext
       │
       ▼
context.ts                       Markdown : titre, statut, dates, html_url,
                                 description, champs, liens parents/enfants
       │
       ▼ (édité par l'utilisateur, copié au presse-papier au choix)
Coder.tsx                        run() → coder:run({ prompt, cwd, binaryPath })
       │
       ▼
runner.ts                        spawn(binary, ['run', prompt], { shell: false })
                                 broadcast('coder:stream') sur stdout / stderr / exit
       │
       ▼
useCoder.handleEvent             accumule la sortie dans `log`, met à jour le statut
```

