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

## IPC surface (Phase 0)

| Canal | Direction | Payload | Réponse |
|---|---|---|---|
| `settings:get` | renderer → main | — | `SettingsState` |
| `settings:set-tuleap-url` | renderer → main | `string \| null` | `SettingsState` |
| `settings:set-token` | renderer → main | `string` (jamais retourné) | `SettingsState` |
| `settings:clear-token` | renderer → main | — | `SettingsState` |
| `settings:set-project-id` | renderer → main | `number \| null` | `SettingsState` |
| `settings:reset` | renderer → main | — | `SettingsState` |
| `tuleap:test-connection` | renderer → main | — | `ConnectionTestResult` |
| `tuleap:list-projects` | renderer → main | `string?` (query) | `ProjectSummary[]` |
| `tuleap:list-trackers` | renderer → main | `number?` (override projectId) | `TrackerSummary[]` |
| `tuleap:list-artifacts` | renderer → main | `{ trackerId, limit?, offset? }` | `Page<ArtifactSummary>` |
| `tuleap:get-artifact` | renderer → main | `number` | `ArtifactDetail` |

`SettingsState` = `{ tuleapUrl, projectId, hasToken, secretStorageAvailable }`. Le token n'apparaît jamais dans les réponses IPC.

## Stockage

| Donnée | Emplacement | Format |
|---|---|---|
| URL Tuleap, projectId | `<userData>/config.json` (electron-store) | JSON |
| Token API perso | `<userData>/secrets/tuleap-token.bin` | Buffer chiffré via `safeStorage` |
| Audit log | `<userData>/data/tuleap-companion.db` | SQLite (table `audit_log`) |

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
