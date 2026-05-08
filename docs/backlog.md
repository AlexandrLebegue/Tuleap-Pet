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

## Découvert pendant la Phase 2 (Chatbot)

- **Tools en écriture** (créer / transitionner un artéfact) : nécessitent une UI de confirmation/diff avant validation, pour éviter qu'un modèle hallucinant ne fasse des changements.
- **Recherche full-text d'artéfacts** comme tool dédié : Tuleap n'a pas d'endpoint de recherche universel, il faut soit s'appuyer sur les query DSL par tracker soit indexer localement.
- **Messages markdown rendus** dans l'UI (au lieu de `whitespace-pre-wrap`) avec coloration des `#1234` cliquables vers le panneau Projet.
- **Edition / regénération d'un message** depuis un point précis de la conversation.
- **Compteur de tokens** dans la sidebar par conversation (déjà disponible via `usage` mais non agrégé).
- **Limite de contexte** : les conversations longues vont dépasser le context window du modèle. Tronquer ou résumer les messages anciens.
- **Tests d'intégration** : exercer un flow chat complet avec un faux LlmProvider qui simule une suite de tool-calls / tool-results.

## Découvert pendant la Phase 3 (OAuth2 + Coder)

- **PKCE en mode `confidential`** : aujourd'hui purement public client. Pour les apps Tuleap qui exigent un client_secret, ajouter un champ chiffré + Basic Auth sur `/oauth2/token`.
- **Refresh proactif** : `resolveTuleapAuth()` rafraîchit à 60s du expiry. Sur de longues sessions sans activité, faire un refresh planifié (timer dans le main) pour éviter les latences au prochain appel.
- **Révocation côté serveur** : aujourd'hui `clearOAuth` se contente d'effacer le bundle local, on ne notifie pas Tuleap. Brancher `/oauth2/revoke` quand l'instance le supporte.
- **TUI OpenCode embarquée** : aujourd'hui on passe par `opencode run <prompt>` (mode non-interactif). Pour offrir l'expérience interactive, intégrer xterm.js dans le tab Coder + node-pty.
- **Builder de contexte récursif** : remonter les parents et descendre dans les enfants, optionnellement inclure le diff git du repo configuré.
- **Détection automatique du binaire** : scanner `$PATH` au démarrage pour proposer le chemin OpenCode dans Réglages.
- **Multi-session** : aujourd'hui on lance une session à la fois. Permettre plusieurs OpenCode en parallèle (un onglet par ticket).

## Découvert pendant la Phase 4 (Admin)

- **Pagination complète du scan** : aujourd'hui on regarde les 25 premiers items par tracker. Les trackers très actifs sous-rapportent. Brancher une boucle qui s'arrête dès qu'un item sort de la fenêtre.
- **Filtre serveur** : si la version Tuleap supporte un query DSL sur `last_modified_date`, l'exploiter (moins de tokens consommés côté tools).
- **Historique des scans** : persister les `AdminScanResult` en SQLite et tracer la tendance jour par jour.
- **Notifications natives** : `Notification` ou `tray icon` quand la synthèse révèle un seuil (ex. > 50 % d'items en retard).
- **Schedule** : un timer (`node-cron`-like) dans le main pour relancer un scan + une synthèse toutes les N heures, archiver le résultat.
- **Export du digest** en `.md` ou `.pdf`.
