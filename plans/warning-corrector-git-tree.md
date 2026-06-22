# Plan — Correcteur de warnings (Git Explorer → « Corriger les warnings »)

> **Statut : implémenté.** Troisième job du Git tree (à côté de 💬 commentateur et
> 🧪 tests). Exécute le script `ai_compil.sh`/`.bat` du dépôt, parse `warning.txt`,
> corrige les warnings des fonctions sélectionnées avec le contexte arbre de code,
> recompile en boucle (retry paramétrable), puis ouvre une PR avec un récapitulatif
> en commentaire.

## 1. Idée et alignement sur l'existant

Le commentateur et le générateur de tests sont déjà des **jobs Git tree** :
`GitExplorer.tsx` (bouton → clone async → `HeaderFunctionSelector` → `git:start-job`)
→ `job-manager.runJob()` (dispatch par `type`) → commit/push/`createPullRequest`.

Le correcteur de warnings suit **exactement** ce pattern, avec en plus une boucle
compile→corrige→recompile pilotée par le script de build du dépôt.

## 2. Déroulé du job `warning-corrector`

Entrées : `selection: { sourceFile, functions }[]`, `existingCloneDir`,
`warningOptions: { maxRetries }`.

1. **Réutilise le clone** (déjà fait par le modal de sélection).
2. **Compile baseline** : `runCompileScript(cloneDir)` découvre `ai_compil.sh`
   (préféré sous Linux/mac) ou `ai_compil.bat`, l'exécute (cwd = dossier du script),
   puis lit `warning.txt` (à côté du script, ou à la racine du clone).
3. **Parse** : `parseWarnings(text)` → `Warning[]` (GCC/Clang + MSVC), normalisés en
   chemins relatifs au clone, classés par `category` (`-Wflag` / code MSVC).
4. **Match sélection** : on ne garde que les warnings dont le fichier correspond à un
   `sourceFile` sélectionné ; raffinement : si des fonctions précises sont cochées,
   on privilégie les warnings dont la `line` tombe dans la plage `[startLine,endLine]`
   d'une fonction cochée (via `buildProjectIndex`). Fallback : granularité fichier.
5. **Boucle de correction** (`for i in 1..1+maxRetries`) :
   - groupe les warnings ciblés restants par fichier ;
   - pour chaque fichier : construit le **contexte arbre de code**
     (`buildContext`+`renderContext` sur les fonctions du fichier) et demande à l'IA
     de réécrire le fichier en corrigeant uniquement les warnings listés
     (`buildWarningFixPrompt`) ; applique l'écriture ;
   - **recompile** + re-parse → `current` ;
   - **diff** : `fixed += baselineCiblés − current` (clé = `file|category|message`,
     insensible aux décalages de lignes) ; `remaining = current ciblés` ;
   - si `remaining` vide → stop ; sinon on reboucle sur `remaining`.
6. **Garde commit vide** : si aucun fichier modifié → erreur explicite (pas de PR).
7. **PR** : branche `tuleap-pet/warnings-xxx`, add/commit/push, `createPullRequest`,
   puis `postPrComment(prId, summary)` — récapitulatif Markdown des warnings corrigés
   (groupés par catégorie/fichier) + nombre de restants + itérations.

## 2 bis. Plusieurs scripts `ai_compil` — exécuter le plus proche

Un dépôt peut contenir plusieurs `ai_compil.sh`/`.bat` (un par module). Pour chaque
fichier de la sélection, on exécute le script **le plus proche** : le dossier
`ai_compil` ancêtre le plus profond (`findNearestScript`). Si aucun script n'est un
ancêtre du fichier, on retombe sur celui qui partage le plus long préfixe de chemin
(sinon le script racine). Les scripts retenus sont dédupliqués
(`resolveScriptsForSelection`) puis exécutés ; leurs `warning.txt` sont fusionnés,
chaque sortie étant parsée avec le dossier de son script comme base pour que les
chemins relatifs se résolvent correctement.

### Exemple `ai_compil.sh` (voir `samples/cpp-demo/ai_compil.sh`)

```sh
#!/usr/bin/env bash
set -u
cd "$(dirname "$0")" || exit 1
OUT="warning.txt"; : > "$OUT"
CXX="${CXX:-g++}"
$CXX -std=c++17 -Wall -Wextra -Wpedantic -fsyntax-only -Isrc src/*.cpp 2>&1 \
  | grep -E ": warning:" >> "$OUT"
echo "ai_compil: $(grep -c ': warning:' "$OUT") warning(s) -> $OUT"
```

Le script doit écrire `warning.txt` **à côté de lui** au format GCC/Clang
(`fichier:ligne:col: warning: message [-Wflag]`) ou MSVC
(`fichier(ligne): warning Cxxxx: message`). Une variante Windows est fournie dans
`samples/cpp-demo/ai_compil.bat`.

## 3. Back-end (`src/main/warning-corrector/`)

- `compile-runner.ts` — `findCompileScripts(dir)` (tous), `findNearestScript(file, scripts)`,
  `runCompileScript(dir, { scriptPath })` (execa, timeout, `reject:false`), lecture de
  `warning.txt`. Erreurs claires si script ou fichier absent.
- `warning-parser.ts` — `parseWarnings`, `groupByFile`, `warningKey`,
  `diffWarnings(before, after)`. Types `Warning`, `WarningDiff`.
- `warning-corrector.ts` — `runWarningCorrector(cloneDir, selection, options, onProgress)`
  : orchestration compile→match→corrige→recompile→retry ; renvoie
  `{ changedFiles, fixed, remaining, initialCount, iterations, warnings }`.
- `warning-prompts.ts` — `buildWarningFixPrompt`, `extractSourceBlock`,
  `buildPrSummary`.

## 4. Câblage

- `src/shared/types.ts` : `JobType += 'warning-corrector'`.
- `job-manager.ts` : dispatch + `runWarningCorrection()` (renvoie `{ label, prComment }`),
  `branchKind = 'warnings'`, `postPrComment` après création de PR, `warningOptions`
  dans `JobStartArgs`.
- `ipc/git-explorer.ts` + `preload/index.ts` + `lib/api.ts` : passe `warningOptions`.
- `GitExplorer.tsx` : bouton ⚠️ + modal `WcModal` (clone → `HeaderFunctionSelector` →
  champ `maxRetries` → `startJob({ type: 'warning-corrector', selection, warningOptions })`).
- **Aucun `ai_compil` détecté** : à l'ouverture du modal, `git:detect-compile-script`
  vérifie la présence d'un script. Si absent, le modal affiche un avertissement et une
  **zone de texte pré-remplie d'un template** éditable ; au lancement,
  `git:write-compile-script` écrit `ai_compil.bat` à la racine du clone avant de
  démarrer le job (le bouton est désactivé tant que le template est vide).
- `JobToast.tsx` : libellé/icône ⚠️ « Correcteur de warnings ».

## 5. Tests

- `warning-parser` : parse GCC/Clang/MSVC, group-by-file, `diffWarnings` (fixés/restants/nouveaux).
- Matching warning→fonction (plages de lignes) sur `samples/cpp-demo`.
- `npm run typecheck` + `npm test` verts.

## 6. Décisions

1. **Exécution réelle du script** (`ai_compil`) dans le clone — conforme à la demande
   (la toolchain doit être disponible dans l'environnement ; sinon erreur explicite).
2. **Correction au grain fichier** (réécriture complète guidée par les warnings + le
   contexte arbre de code) — gère aussi les warnings non liés à une fonction (includes,
   statiques inutilisés). Le périmètre reste borné aux fichiers/fonctions sélectionnés.
3. **Diff insensible aux lignes** (`file|category|message`) pour suivre fiablement les
   corrections malgré les décalages.
4. **Récapitulatif en commentaire de PR** via `postPrComment`.
</content>
</invoke>
