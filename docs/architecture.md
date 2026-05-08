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

## IPC surface (Phase 0 + Phase 1)

| Canal | Direction | Payload | Réponse |
|---|---|---|---|
| `settings:get` | renderer → main | — | `SettingsState` |
| `settings:set-tuleap-url` | renderer → main | `string \| null` | `SettingsState` |
| `settings:set-token` | renderer → main | `string` (jamais retourné) | `SettingsState` |
| `settings:clear-token` | renderer → main | — | `SettingsState` |
| `settings:set-project-id` | renderer → main | `number \| null` | `SettingsState` |
| `settings:set-llm-key` | renderer → main | `string` (jamais retourné) | `SettingsState` |
| `settings:clear-llm-key` | renderer → main | — | `SettingsState` |
| `settings:set-llm-model` | renderer → main | `string \| null` | `SettingsState` |
| `settings:reset` | renderer → main | — | `SettingsState` |
| `tuleap:test-connection` | renderer → main | — | `ConnectionTestResult` |
| `tuleap:list-projects` | renderer → main | `string?` (query) | `ProjectSummary[]` |
| `tuleap:list-trackers` | renderer → main | `number?` (override projectId) | `TrackerSummary[]` |
| `tuleap:list-artifacts` | renderer → main | `{ trackerId, limit?, offset? }` | `Page<ArtifactSummary>` |
| `tuleap:get-artifact` | renderer → main | `number` | `ArtifactDetail` |
| `generation:list-sprints` | renderer → main | `MilestoneStatus?` (`'open'`) | `MilestoneSummary[]` |
| `generation:get-sprint-content` | renderer → main | `number` | `SprintContent` |
| `generation:test-llm` | renderer → main | — | `LlmTestResult` |
| `generation:generate-sprint-review` | renderer → main | `{ milestoneId, language? }` | `{ markdown, model, finishReason, usage }` |
| `marp:render-preview` | renderer → main | `string` (markdown) | `{ html }` (sandboxed) |
| `marp:export-pptx` | renderer → main | `{ markdown, suggestedName? }` | `MarpExportResult` (ok / cancelled / error) |

`SettingsState` = `{ tuleapUrl, projectId, hasToken, secretStorageAvailable, llmModel, llmDefaultModel, hasLlmKey, llmKeyFromEnv }`. Ni le token Tuleap ni la clé OpenRouter n'apparaissent jamais dans les réponses IPC.

## Stockage

| Donnée | Emplacement | Format |
|---|---|---|
| URL Tuleap, projectId, modèle LLM | `<userData>/config.json` (electron-store) | JSON |
| Token API perso Tuleap | `<userData>/secrets/tuleap-token.bin` | Buffer chiffré via `safeStorage` |
| Clé API OpenRouter | `<userData>/secrets/openrouter-key.bin` | Buffer chiffré via `safeStorage` |
| Audit log | `<userData>/data/tuleap-companion.db` | SQLite (table `audit_log`) |
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
