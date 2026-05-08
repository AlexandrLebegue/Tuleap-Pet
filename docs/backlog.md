# Backlog — idées hors scope de la phase courante

Capture en vrac des ajouts repérés au fil des phases. À reprioritiser au début de chaque phase suivante.

## Découvert pendant la Phase 0

- **shadcn Combobox** pour le sélecteur de projet (la liste devient lourde au-delà de quelques dizaines).
- **Combobox + recherche serveur** sur `/api/projects?query=…` (le filtrage actuel est full-page client-side, limite à 100).
- **Cache local** (table SQLite) des trackers / artéfacts récemment consultés pour offrir une vue offline.
- **Vue détail enrichie** : rendu HTML / Markdown des champs `text` (Tuleap supporte plusieurs formats).
- **Liens artéfacts cliquables** dans le panneau de détail (ouvrir l'artéfact lié).
- **Audit log viewer** : un petit écran admin local pour consulter `audit_log`.
- **Test d'intégration** sur la chaîne IPC complète (mock fetch + simulation du main).
- **DevTools** masqués en prod (vérifier que F12 ne les ouvre pas dans le bundle packagé).
- **electron-updater** + signature de code à brancher avant la première release publique.
- **i18n** : tout est en français en dur — éventuellement gérer en/fr plus tard.

## Réservé pour la Phase 1 (Génération IA)

- Provider LLM avec Ollama par défaut, OpenAI/Anthropic via env.
- Prompts versionnés en `docs/prompts/*.md`.
- Pipeline Marp → PPTX via `marp-cli` en subprocess.

## Réservé pour la Phase 2 (Chatbot)

- Persistance des conversations en SQLite (nouvelle migration).
- Streaming via Vercel AI SDK + indication visuelle des tool calls.

## Réservé pour la Phase 3 (OAuth2 + Coder)

- OAuth2 Authorization Code + PKCE via mini serveur HTTP loopback.
- Wrapper subprocess pour OpenCode (sst/opencode) avec injection de contexte.
- Builder de contexte : récupération récursive parents/enfants + repo git lié.

## Réservé pour la Phase 4 (Admin)

- À scoper : indicateurs de santé, alertes, anomalies, résumés hebdo.
