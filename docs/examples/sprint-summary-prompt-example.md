# Exemple de prompt de synthèse (données enrichies)

Ce fichier montre les données réellement envoyées au LLM par le pipeline
(`sprint_summary`) après enrichissement : hiérarchie US → sous-tâches,
dernières mises à jour (changesets), branches Git et pull requests.
Généré par `tests/generation-pipeline.test.ts` (WRITE_EXAMPLE=1).

---

## Contexte du sprint

- **Projet :** Portail Audit
- **Sprint :** Sprint 24.07
- **Début :** 2026-06-23
- **Fin :** 2026-07-07
- **Artefacts total :** 4 (1 terminés, 2 en cours, 1 non commencés)

## Artefacts du sprint (user stories et leurs sous-tâches)

### #1201 — US — Export PDF des rapports d’audit
- **Statut :** En cours
- **Description :** En tant qu’auditeur, je veux exporter mes rapports en PDF afin de les archiver.
- **Soumis par :** Alice Martin
- **Date soumission :** 2026-06-20
- **Points :** 8
- **Assigné à :** Alice Martin
- **Critères d'acceptance :** Le PDF respecte le gabarit officiel Export en moins de 10 secondes
- **Effort restant :** 12
- **Références :** pr #77, git #webapp/bbb222
- **Dernière mise à jour :** 2026-07-04 par Alice Martin
- **Dernier commentaire :** PDF serveur OK, reste la prévisualisation — PR ouverte pour revue.
- **Branche :** `feature/1201-export-pdf` (dépôt webapp) — dernier commit : « feat(export): page de prévisualisation PDF » (David Roux, 2026-07-04)
- **Pull request :** PR #77 « Export PDF des rapports (art #1201) » (feature/1201-export-pdf → main, statut review) par David Roux

#### ↳ #1210 — Générer le PDF côté serveur (lib wkhtmltopdf) _(sous-tâche)_
- **Statut :** Terminé
- **Soumis par :** Alice Martin
- **Date soumission :** 2026-06-24
- **Dernière mise à jour :** 2026-07-01 par Alice Martin
- **Dernier commentaire :** Terminé, couvert par tests unitaires.
#### ↳ #1211 — Page de prévisualisation avant export _(sous-tâche)_
- **Statut :** En cours
- **Soumis par :** David Roux
- **Date soumission :** 2026-06-24
- **Dernière mise à jour :** 2026-07-04

### #1202 — US — Authentification SSO (SAML)
- **Statut :** Terminé
- **Soumis par :** Bob Durand
- **Date soumission :** 2026-06-18
- **Points :** 5
- **Dernière mise à jour :** 2026-07-02 par Bob Durand
- **Dernier commentaire :** Recette validée en préprod, story fermée.

#### ↳ #1212 — Configurer le connecteur SAML côté IdP _(sous-tâche)_
- **Statut :** Terminé
- **Soumis par :** Bob Durand
- **Date soumission :** 2026-06-19
- **Dernière mise à jour :** 2026-07-02

### #1203 — Bug — Crash à l’ouverture du dashboard
- **Statut :** En cours
- **Soumis par :** Chloé Petit
- **Date soumission :** 2026-06-25
- **Sévérité :** Critique
- **Dernière mise à jour :** 2026-07-05 par Chloé Petit
- **Dernier commentaire :** Reproduit uniquement avec le cache vide — correctif en cours sur fix/1203.
- **Branche :** `fix/1203-dashboard-crash` (dépôt webapp) — dernier commit : « fix(dashboard): guard sur cache vide » (Chloé Petit, 2026-07-05)
- **Pull request :** PR #78 « Correctif crash dashboard » (fix/1203-dashboard-crash → main, statut review) par Chloé Petit

### #1204 — US — Notifications e-mail configurables
- **Statut :** À faire
- **Soumis par :** Alice Martin
- **Date soumission :** 2026-06-22
- **Dernière mise à jour :** 2026-06-22

## Dernières mises à jour (activité récente)

- 2026-07-05 — #1203 Bug — Crash à l’ouverture du dashboard [En cours] par Chloé Petit : « Reproduit uniquement avec le cache vide — correctif en cours sur fix/1203. »
- 2026-07-04 — #1201 US — Export PDF des rapports d’audit [En cours] par Alice Martin : « PDF serveur OK, reste la prévisualisation — PR ouverte pour revue. »
- 2026-07-02 — #1202 US — Authentification SSO (SAML) [Terminé] par Bob Durand : « Recette validée en préprod, story fermée. »
- 2026-07-01 — #1210 Générer le PDF côté serveur (lib wkhtmltopdf) [Terminé] par Alice Martin : « Terminé, couvert par tests unitaires. »

## Activité code (branches et pull requests)

**Pull requests en cours (2) :**
- PR #77 « Export PDF des rapports (art #1201) » : feature/1201-export-pdf → main [review] — par David Roux — ouverte le 2026-07-03 — artefacts : #1201
- PR #78 « Correctif crash dashboard » : fix/1203-dashboard-crash → main [review] — par Chloé Petit — ouverte le 2026-07-05 — artefacts : #1203

**Branches liées aux artefacts du sprint (2) :**
- `feature/1201-export-pdf` (dépôt webapp) → #1201 — dernier commit « feat(export): page de prévisualisation PDF » (David Roux, 2026-07-04)
- `fix/1203-dashboard-crash` (dépôt webapp) → #1203 — dernier commit « fix(dashboard): guard sur cache vide » (Chloé Petit, 2026-07-05)

---

Produis une synthèse structurée en 4 sections :

## Objectif du sprint
[Déduis l'objectif principal à partir des artefacts. 2-3 phrases max.]

## État d'avancement
[Résume l'avancement réel : ce qui est fait, ce qui est en cours, ce qui est bloqué. Appuie-toi sur les sous-tâches, les dernières mises à jour et les pull requests en cours (code écrit mais pas encore fusionné).]

## Points notables
[3-5 points clés : réussites, difficultés, décisions importantes, pull requests en attente de revue, activité récente marquante.]

## Risques & blocages
[Identifie les risques ou blocages visibles : items sans activité récente, items en cours sans branche de code, pull requests anciennes non fusionnées. Si aucun, écris "Aucun identifié."]
