# Plan — Sélection des fichiers à tester (Git Explorer → Générer des tests)

## 1. Analyse de la boucle de génération actuelle

### Où elle vit

`src/main/jobs/job-manager.ts` → `runJob()`. Déclenchée depuis l'onglet **Git tree** (`src/renderer/src/routes/GitExplorer.tsx`), bouton 🧪 → modal d'options → `git:start-job` (`src/main/ipc/git-explorer.ts`) → `startJob()`.

### Déroulé (type `test-generator`)

1. Clone de la branche dans `tempClonePath/<repo>_<jobId>`.
2. `files = listSourceFiles(targetDir)` → **tous** les `.c/.h/.cpp/.hpp/.cxx/.hxx/.cc` (cf. `git-utils.ts` `SOURCE_GLOBS`), ou ceux du dernier commit si `onlyChangedFiles`.
3. `testDir = findTestDirectory(targetDir)` (un seul dossier pour tout le repo).
4. **Boucle sur chaque fichier** :
   - skip si le basename matche `/test/i` ;
   - `advanced` → `generateTestsGranular(content, filename, undefined, undefined, targetDir, fullPath)` ; chaque fichier de test écrit dans `outDir` ;
   - `basic` → `generateTestsForFile()` → `test_<base>.c`.
5. Nouvelle branche `tuleap-pet/tests-xxx`, `gitAdd` → `gitCommit` → `gitPush` → `createPullRequest`.
6. `finally { cleanupDir() }` supprime le clone.

### Cas qui ne fonctionnent pas / posent problème

| # | Problème | Cause | Impact |
|---|---|---|---|
| **A** | Génère pour **tout le repo** en aveugle | `listSourceFiles()` sans sélection ; `onlyFunctions` toujours `undefined` | Coût LLM/temps explosifs, PR énorme — **c'est le besoin à corriger** |
| **B** | Les **headers** (`.h/.hpp/.hxx`) sont passés au générateur | `SOURCE_GLOBS` inclut les headers | Pas de corps de fonction → tests vides ou hallucinés, appels gaspillés |
| **C** | Aucune granularité par fonction | `onlyFunctions=undefined` dans le chemin job | Tests pour toutes les fonctions de tous les fichiers |
| **D** | **Aucune intégration CMake ni compilation** | Le job appelle `generateTestsGranular` directement, **pas** `runPipeline` | `testBuildEnabled` / `testPreset` / `testMaxRepairs` sont des **options mortes** ; tests commités non compilés/non câblés |
| **E** | Regex de skip `/test/i` trop large | Match sur substring du basename | Skip à tort `latest.c`, `attestation.cpp`, `contest.c`… |
| **F** | **Collisions de noms** de fichiers de test | Sortie `test_<funcName>.cpp` dans un `outDir` unique | Deux `init()` dans deux fichiers → écrasement silencieux |
| **G** | Frameworks **incohérents** basic vs advanced | basic = C/CUnit `.c`, advanced = gtest `.cpp` | Résultat imprévisible — **basic à supprimer** |
| **H** | Échec sur commit vide | Si tous fichiers skip/échoués → rien écrit → `gitCommit` échoue | Message d'erreur git obscur au lieu d'un message clair |
| **I** | Échec de création de PR avalé | `catch` seulement `debugError`, job marqué `done`, `prId=null` | État « terminé » trompeur |
| **J** | Pas de progression intra-fichier | `onProgress` de `generateTestsGranular` non transmis | Gros fichiers paraissent figés |
| **K** | Clone supprimé en `finally` | Incompatible avec « cloner puis laisser choisir » | Le clone doit persister entre listing et génération |

---

## 2. UX cible

Clic sur 🧪 **Générer des tests** (sur une branche) →

1. **Clone asynchrone immédiat** de la branche (spinner « Clonage… »). Réutilise `testgen:git-clone-and-list` qui clone + renvoie la liste de fichiers.
2. À la fin du clone → **menu de sélection des fichiers** :
   - **Barre de recherche** (filtre par chemin, insensible à la casse) ;
   - **Sélecteur double liste (transfer list)** : à gauche « Fichiers disponibles » (sources seulement, headers exclus), à droite « À tester » ; boutons **Ajouter →** / **← Retirer** (+ double-clic). Boutons « Tout ajouter / tout retirer ».
   - Compteur « N sélectionné(s) ».
3. Bouton **Générer les tests (N)** actif dès 1 fichier sélectionné → lance le job sur **uniquement** les fichiers retenus, en pipeline **avancé**.
4. Le job suit le flux existant (commit / push / PR) avec progression par fichier sélectionné.

États du modal : `cloning → selecting → starting`. Annuler / fermer → nettoie le clone.

---

## 3. Changements back-end

### 3.1 Types partagés (`src/shared/types.ts`)
- Ajouter `selectedFiles?: string[]` (chemins relatifs au repo) aux args de `git:start-job`.
- Ajouter `existingCloneDir?: string` aux args de job (réutiliser le clone déjà fait).
- `CommentingOptions` : retirer `testPipelineMode` (ou figer à `'advanced'`). Conserver `testBuildEnabled/testPreset/testMaxRepairs` seulement si on câble le build (cf. 3.4).

### 3.2 IPC (`src/main/ipc/git-explorer.ts`)
- `git:start-job` : récupérer et transmettre `selectedFiles` + `existingCloneDir`.

### 3.3 `job-manager.ts` — `runJob`
- **Réutiliser le clone** : si `existingCloneDir` fourni et valide, sauter l'étape clone et travailler dedans ; sinon clone comme aujourd'hui. La propriété du nettoyage passe au job (et au modal en cas d'annulation avant génération).
- **Restreindre aux fichiers sélectionnés** : si `selectedFiles?.length`, `files = selectedFiles` (au lieu de `listSourceFiles`).
- **Exclure les headers** du traitement test-gen (ne générer que pour `.c/.cpp/.cc/.cxx`) → corrige **B**.
- **Supprimer le chemin `basic`** → toujours `generateTestsGranular` → corrige **G**.
- **Noms anti-collision** : préfixer par le basename source, `test_<sourceBase>_<funcName>.cpp` → corrige **F**.
- **Skip plus strict** : ne skipper que les fichiers déjà sous le dossier de tests ou matchant `^test_|_test\.` → corrige **E**.
- **Garde commit vide** : si 0 fichier de test produit → erreur explicite (« Aucun test généré pour les fichiers sélectionnés »), pas de commit → corrige **H**.
- **PR** : si la création échoue, remonter un événement d'avertissement plutôt que `done` silencieux → atténue **I**.

### 3.4 (Optionnel, hors-scope par défaut) Build/CMake dans le job
Un repo fraîchement cloné n'a généralement pas la toolchain/deps → build non fiable côté job. **Recommandation** : laisser le build self-repair à l'onglet interactif (`runPipeline`) et garder le job sur génération + (optionnellement) câblage `CMakeLists`. Si on veut le build dans le job plus tard : factoriser `runPipeline` pour accepter une liste de fichiers + un `cloneDir`.

---

## 4. Changements front-end

### 4.1 `GitExplorer.tsx`
- Remplacer le `jobModal` actuel par un **modal multi-étapes** pour `test-generator` :
  - À l'ouverture (`openModal('test-generator', branch)`) : appeler `api.testgen.gitCloneAndList({ repoUrl, branch, onlyRecentFiles })`, stocker `cloneDir` dans un ref, filtrer aux fichiers source (réutiliser `isSourceFile`).
  - Afficher le **TestFileSelector** (cf. 4.2).
  - « Générer » → `api.gitExplorer.startJob({ ..., type:'test-generator', selectedFiles, existingCloneDir: cloneDir })`.
  - Fermeture/annulation → `api.testgen.cleanupCloneDir({ cloneDir })` si le job n'a pas démarré.
- Le bouton 💬 commentateur garde son modal actuel inchangé.

### 4.2 Nouveau composant `TestFileSelector` (transfer list)
- Props : `files: string[]`, `selected: string[]`, `onChange`.
- Barre de recherche (état local `query`).
- Deux colonnes + boutons Ajouter/Retirer/Tout. Double-clic = transfert rapide.
- Réutilisable aussi par l'onglet TestGenerator si besoin.

### 4.3 `TestGenerator.tsx` + `SourceInputPanel`
- Retirer le choix `pipelineMode` basic/advanced (toujours avancé). Simplifier le bloc « Pipeline » (garder build/preset/repairs).

### 4.4 Nettoyage « basic »
- Supprimer l'usage de `generateTestsForFile` dans `job-manager.ts`.
- Déprécier/retirer `src/main/jobs/test-gen-file.ts` (et son test associé si présent) si plus aucun appelant.
- Retirer les radios « Basique » dans `GitExplorer.tsx` et `TestGenerator.tsx`, et `testPipelineMode` de `DEFAULT_OPTIONS`.

---

## 5. Tests
- **Unit** `job-manager` : avec `selectedFiles` → ne traite que ceux-ci ; headers exclus ; commit vide → erreur claire ; noms anti-collision.
- **Unit** réutilisation `existingCloneDir` (pas de re-clone).
- **Composant** `TestFileSelector` : recherche filtre, add/remove, tout ajouter/retirer.
- Vérifier `npm run typecheck` + `npm test` verts après suppression du chemin basic.

---

## 6. Points de décision (à confirmer)
1. **Réutiliser le clone** (recommandé) vs re-cloner dans le job (plus simple, clone ×2).
2. **Build dans le job** : non par défaut (toolchain absente) — OK ?
3. **Headers** : exclus de la génération mais affichés grisés, ou totalement masqués (recommandé : masqués) ?
