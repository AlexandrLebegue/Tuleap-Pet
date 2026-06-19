# Plan — Sélection des fichiers/fonctions à tester (Git Explorer → Générer des tests)

> **Statut : implémenté.** Index headers→fonctions→impl (`testgen:build-header-index`),
> sélection hiérarchique (`HeaderFunctionSelector`), job piloté par `selection` avec
> réutilisation du clone, suppression du pipeline basic. Voir commits sur la branche.


## 1. Analyse de la boucle de génération actuelle

### Où elle vit

`src/main/jobs/job-manager.ts` → `runJob()`. Déclenchée depuis l'onglet **Git tree** (`src/renderer/src/routes/GitExplorer.tsx`), bouton 🧪 → modal d'options → `git:start-job` (`src/main/ipc/git-explorer.ts`) → `startJob()`.

### Déroulé (type `test-generator`)

1. Clone de la branche dans `tempClonePath/<repo>_<jobId>`.
2. `files = listSourceFiles(targetDir)` → **tous** les `.c/.h/.cpp/.hpp/.cxx/.hxx/.cc`, ou ceux du dernier commit si `onlyChangedFiles`.
3. `testDir = findTestDirectory(targetDir)` (un seul dossier).
4. **Boucle sur chaque fichier** : skip si basename matche `/test/i` ; `advanced` → `generateTestsGranular(...)` ; `basic` → `generateTestsForFile()`.
5. Branche `tuleap-pet/tests-xxx`, `gitAdd` → `gitCommit` → `gitPush` → `createPullRequest`.
6. `finally { cleanupDir() }` supprime le clone.

### Cas qui ne fonctionnent pas / posent problème

| # | Problème | Cause | Impact |
|---|---|---|---|
| **A** | Génère pour **tout le repo** en aveugle | `listSourceFiles()` sans sélection ; `onlyFunctions` toujours `undefined` | Coût LLM/temps explosifs, PR énorme — **le besoin à corriger** |
| **B** | Les **headers** sont passés tels quels au générateur | `SOURCE_GLOBS` inclut les headers | Pas de corps → tests vides/hallucinés |
| **C** | Aucune granularité par fonction | `onlyFunctions=undefined` | Tests pour toutes les fonctions |
| **D** | **Aucune compilation ni câblage CMake** | Job appelle `generateTestsGranular`, pas `runPipeline` | `testBuildEnabled/Preset/MaxRepairs` = options **mortes** |
| **E** | Regex de skip `/test/i` trop large | Match substring basename | Skip à tort `latest.c`, `contest.cpp`… |
| **F** | **Collisions** de noms de fichiers de test | `test_<funcName>.cpp` dans un `outDir` unique | Écrasement silencieux |
| **G** | Frameworks **incohérents** basic vs advanced | basic = C/CUnit, advanced = gtest | Imprévisible — **basic à supprimer** |
| **H** | Échec sur commit vide | Tous skip/échoués → rien écrit | Erreur git obscure |
| **I** | Échec de PR avalé | `catch` → `debugError` seulement | Job `done` trompeur (`prId=null`) |
| **J** | Pas de progression intra-fichier | `onProgress` non transmis | Gros fichiers paraissent figés |
| **K** | Clone supprimé en `finally` | Incompatible avec « cloner puis choisir » | Le clone doit persister |

---

## 2. UX cible (sélection hiérarchique pilotée par les headers)

Clic sur 🧪 **Générer des tests** →

1. **Clone asynchrone immédiat** de la branche (état « Clonage… »), via `testgen:git-clone-and-list` (le clone est **conservé**).
2. **Indexation** du clone (`buildProjectIndex`) → renvoie la liste des **headers** avec, pour chacun, ses **fonctions déclarées** et **où chaque fonction est implémentée** (fichier `.c/.cpp` + ligne).
3. **Menu de sélection** :
   - **Barre de recherche** (filtre sur chemin de header + nom de fonction) ;
   - **Liste des headers uniquement** (`.h/.hpp/.hxx`). Clic sur un header → **sous-menu déplié** listant ses fonctions ; chaque fonction affiche **sa localisation d'implémentation** (« impl : `src/foo.c:42` » ou « header-only / inline ») ;
   - **Cases à cocher à 3 niveaux** :
     - **Globale** : tout sélectionner / tout désélectionner (toute la liste) ;
     - **Par header (fichier)** : (dé)sélectionne toutes les fonctions du header (état indéterminé si partiel) ;
     - **Par fonction** : sélection fine.
   - Compteur « N fonction(s) dans M fichier(s) ».
4. Bouton **Générer les tests (N)** actif dès 1 fonction cochée → lance le job sur **uniquement** ces fonctions, pipeline **avancé**, en réutilisant le clone.

États du modal : `cloning → indexing → selecting → starting`. Fermeture/annulation avant démarrage → nettoie le clone.

---

## 3. Changements back-end

### 3.1 Nouvelle structure d'index (IPC)
Ajouter `testgen:build-header-index` (ou étendre `git-clone-and-list`) : entrée `{ cloneDir }`, sortie typée :

```ts
type HeaderFunction = {
  name: string
  signature: string
  declFile: string          // header, relatif au clone
  declLine: number
  implFile: string | null   // .c/.cpp avec body (relatif), null si header-only/inline
  implLine: number | null
  hasImpl: boolean
}
type HeaderEntry = { headerPath: string; functions: HeaderFunction[] }
type HeaderIndexResult =
  | { ok: true; cloneDir: string; headers: HeaderEntry[] }
  | { ok: false; error: string }
```

Implémentation (réutilise `src/main/cpp-analyzer`) :
- `buildProjectIndex(cloneDir)` ;
- headers = `index.files.filter(isHeaderFile)` ;
- pour chaque header, `index.byFile.get(header)` → fonctions déclarées ;
- pour chacune, impl = `index.byName.get(name)` → le `FunctionDef` avec `hasBody && !isHeader` (préférer même basename via `findCounterpart`) → `implFile/implLine` ; sinon `header-only`.

### 3.2 Args de job (`src/shared/types.ts` + `git:start-job`)
- Remplacer le besoin « tous fichiers » par une **sélection fonctionnelle** :
  ```ts
  selection?: Array<{ sourceFile: string; functions: string[] }>  // sourceFile relatif au clone
  existingCloneDir?: string
  ```
- Regroupement côté front : fonctions cochées → groupées par `implFile` (ou header si header-only) → `selection`.
- `CommentingOptions` : retirer `testPipelineMode` (toujours avancé). `testBuildEnabled/Preset/MaxRepairs` deviennent inutiles côté job (décision : pas de build dans le job) → retirables.

### 3.3 `job-manager.ts` — `runJob`
- **Réutiliser le clone** : si `existingCloneDir` valide → travailler dedans, sauter le clone ; le nettoyage devient la responsabilité du job (et du modal si annulation avant démarrage).
- **Itérer sur `selection`** au lieu de `listSourceFiles` : pour chaque `{ sourceFile, functions }` → `generateTestsGranular(content, sourceFile, functions, onProgress, cloneDir, fullPath)`.
- **Supprimer le chemin `basic`** (corrige **G**) ; supprimer le skip `/test/i` (corrige **E**) ; corps de fonction garantis car on cible des fonctions implémentées (corrige **B/C**).
- **Noms anti-collision** : `test_<sourceBase>_<funcName>.cpp` (corrige **F**).
- **Garde commit vide** : si 0 test produit → erreur explicite, pas de commit (corrige **H**).
- **Progression** : transmettre `onProgress` de `generateTestsGranular` → événements plus fins (corrige **J**).
- **PR** : si échec, événement d'avertissement au lieu de `done` silencieux (atténue **I**).

### 3.4 Build/CMake dans le job
**Décision : non.** Un repo cloné n'a pas la toolchain → le build self-repair reste sur l'onglet TestGenerator interactif (`runPipeline`). Le job fait génération seule.

---

## 4. Changements front-end

### 4.1 `GitExplorer.tsx`
- Modal `test-generator` multi-étapes :
  - ouverture → `gitCloneAndList({ repoUrl, branch })` puis `buildHeaderIndex({ cloneDir })` ; stocker `cloneDir` (ref) ;
  - rendre **`<HeaderFunctionSelector>`** ;
  - « Générer » → construire `selection` (group by implFile/header) → `api.gitExplorer.startJob({ ..., selection, existingCloneDir: cloneDir })` ;
  - fermeture sans démarrage → `cleanupCloneDir({ cloneDir })`.
- Le bouton 💬 commentateur reste inchangé.

### 4.2 Nouveau composant `HeaderFunctionSelector`
- Props : `headers: HeaderEntry[]`, `selected: Set<string>` (clé `implFileOrHeader::name`), `onChange`.
- **Recherche** (header path + nom de fonction).
- **Accordéon par header** : ligne header avec checkbox tri-état (tout/partiel/rien) + chevron ; déplié → fonctions avec checkbox, signature, et badge **« impl : `path:line` »** (ou « header-only »).
- **Checkbox globale** « Tout sélectionner / désélectionner ».
- Compteur N fonctions / M fichiers.

### 4.3 `TestGenerator.tsx` + `SourceInputPanel`
- Retirer le choix `pipelineMode` basic/advanced (toujours avancé) ; simplifier le bloc « Pipeline ».

### 4.4 Nettoyage « basic »
- Retirer l'usage de `generateTestsForFile` dans `job-manager.ts` ; déprécier/supprimer `src/main/jobs/test-gen-file.ts` (+ test associé) si plus d'appelant.
- Retirer les radios « Basique », `testPipelineMode` de `DEFAULT_OPTIONS`.

---

## 5. Tests
- **Unit** index headers : header → fonctions → impl file correct (utiliser `samples/cpp-demo`).
- **Unit** `job-manager` : `selection` respectée ; réutilise `existingCloneDir` (pas de re-clone) ; commit vide → erreur claire ; noms anti-collision.
- **Composant** `HeaderFunctionSelector` : recherche, tri-état par header, checkbox globale, group-by impl pour la sortie.
- `npm run typecheck` + `npm test` verts après suppression du chemin basic.

---

## 6. Décisions (confirmées)
1. **Réutiliser le clone** du listing comme répertoire de travail du job. ✅
2. **Pas de build/CMake dans le job** (génération seule ; build réservé à l'onglet interactif). ✅
3. **Sélecteur piloté par les headers** : afficher uniquement les headers, drill-down vers les fonctions avec leur fichier d'implémentation ; checkboxes globale / par header / par fonction. ✅
