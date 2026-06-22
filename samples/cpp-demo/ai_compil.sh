#!/usr/bin/env bash
#
# ai_compil.sh — Exemple de script de compilation pour le « Correcteur de warnings ».
#
# Rôle attendu par Tuleap AI Companion :
#   1. compiler le projet (ou le sous-module) ;
#   2. écrire TOUS les warnings du compilateur dans un fichier `warning.txt`
#      placé À CÔTÉ de ce script, au format GCC/Clang :
#          chemin/fichier.cpp:LIGNE:COLONNE: warning: message [-Wflag]
#
# Le correcteur exécute ce script, lit `warning.txt`, corrige les warnings des
# fonctions sélectionnées, puis relance ce même script pour vérifier.
#
# S'il existe plusieurs `ai_compil.sh` dans le dépôt (un par module), le
# correcteur lance celui qui est le plus proche du fichier concerné.
#
set -u

# Toujours travailler depuis le dossier du script (le correcteur le fait déjà,
# mais on le garantit pour une exécution manuelle).
cd "$(dirname "$0")" || exit 1

OUT="warning.txt"
: > "$OUT"   # vide le fichier de la passe précédente

CXX="${CXX:-g++}"
WARN_FLAGS="-std=c++17 -Wall -Wextra -Wpedantic -fsyntax-only"

# ── Option A : compilation directe (robuste, pas de configuration requise) ────
# On ne garde que les lignes « : warning: » pour fournir un log propre au parser.
$CXX $WARN_FLAGS -Isrc src/*.cpp 2>&1 | grep -E ": warning:" >> "$OUT"

# ── Option B : via CMake (décommenter si votre projet a besoin du build complet)
# cmake -S . -B build/ai-compil -DCMAKE_BUILD_TYPE=Debug \
#       -DCMAKE_CXX_FLAGS="-Wall -Wextra" -DCPP_DEMO_BUILD_TESTS=OFF >/dev/null 2>&1
# cmake --build build/ai-compil 2>&1 | grep -E ": warning:" >> "$OUT"

echo "ai_compil: $(grep -c ': warning:' "$OUT" 2>/dev/null || echo 0) warning(s) -> $OUT"
exit 0
