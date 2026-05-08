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

## Découvert pendant la Phase 1

- **Provider Ollama** branché sur le même `LlmProvider` (la phase a livré OpenRouter en premier sur demande utilisateur, l'abstraction reste prête).
- **Streaming temps-réel** côté Génération IA : `generation:generate-sprint-review` est aujourd'hui non-streamée, on attend la fin du `generateText()`. Brancher `provider.stream()` + `webContents.send` pour afficher le markdown au fil de l'eau.
- **Cancellation** via `AbortController` propagé au LLM et à marp-cli (utile pour les longs prompts ou les erreurs réseau).
- **Templates de prompts éditables** : aujourd'hui figés via `?raw`. Pour les pouvoirs utilisateurs, charger depuis `<userData>/prompts/` avec un fallback sur le bundle.
- **Pagination du milestone content** au-delà de 200 items (pour les grands sprints).
- **Cache LLM** pour économiser tokens : déduire un hash (sprint+modèle+template) et cacher la réponse en SQLite.
- **Indicateur de coût** : OpenRouter expose `usage` dans la réponse, on a déjà les tokens — manque l'estimation $ via la grille publique.
- **Preview Marp temps-réel pendant l'édition** (debounce sur input plutôt que sur blur).
- **Bundling du Chromium** dans l'app packagée : aujourd'hui dépendance externe à puppeteer. Pour electron-builder, ajouter `extraResources` ou inclure un build de marp-cli + Chromium via `@puppeteer/browsers`.
- **Tests d'intégration** sur le pipeline complet (mock OpenRouter + Tuleap, vérifier le markdown généré et le PPTX).

## Réservé pour la Phase 2 (Chatbot)

- Persistance des conversations en SQLite (nouvelle migration).
- Streaming via Vercel AI SDK + indication visuelle des tool calls (réutilise l'abstraction `LlmProvider.stream`).
- Tools Tuleap exposés au modèle (`get_artifact`, `search_artifacts`, `list_milestones`).

## Réservé pour la Phase 3 (OAuth2 + Coder)

- OAuth2 Authorization Code + PKCE via mini serveur HTTP loopback.
- Wrapper subprocess pour OpenCode (sst/opencode) avec injection de contexte.
- Builder de contexte : récupération récursive parents/enfants + repo git lié.

## Réservé pour la Phase 4 (Admin)

- À scoper : indicateurs de santé, alertes, anomalies, résumés hebdo.
