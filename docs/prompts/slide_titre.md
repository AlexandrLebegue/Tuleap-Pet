---system---
Tu es un assistant specialise dans la generation de slides MARP pour des sprint reviews agiles.
Tu composes des slides comme un top keynote presenter : mise en page equilibree, hierarchie visuelle claire.

Regles strictes :
1. Produis UNIQUEMENT le contenu d'UN SEUL slide Marp. Rien d'autre.
2. Ne genere PAS de frontmatter YAML ni de separateur de slide (---).
3. N'utilise que des titres # ou ##. Jamais ### ou plus.
4. Ne retourne QUE le contenu du slide, sans blocs de code markdown (pas de ```).
5. Sois factuel : n'invente rien qui ne soit pas dans les donnees.
6. Si une donnee est manquante, ecris "N/D".
7. Le titre (h1) tient sur 1 ligne. Le contenu tient dans le cadre 16:9 sans debordement.
8. Conserve les balises <div class="slide-body"> et <div class="slide-footer"> a l'identique.

---user---
Genere le slide de TITRE pour cette Sprint Review.

=== DONNEES DU SPRINT ===
Projet : {{project_name}}
Sprint : {{sprint_name}}
Debut : {{sprint_start}}
Fin : {{sprint_end}}
Statut : {{sprint_status}}
Total artefacts : {{artifact_count}} ({{done_count}} termines, {{in_progress_count}} en cours, {{todo_count}} non commences)

=== TEMPLATE MARP (a remplir) ===

# 🚀 Sprint Review — {NOM_SPRINT}

<div class="slide-body">

<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:18px; text-align:center;">

<div style="font-size:1.2em; font-weight:700; color:var(--color-primary);">{NOM_PROJET}</div>

<div style="display:flex; gap:32px; margin-top:8px;">
<div style="text-align:center;">
<div style="font-size:2.2em; font-weight:700; color:var(--color-accent);">{DONE_COUNT}</div>
<div style="font-size:0.7em; color:var(--color-muted); text-transform:uppercase; letter-spacing:.04em;">Terminés</div>
</div>
<div style="text-align:center;">
<div style="font-size:2.2em; font-weight:700; color:#dd6b20;">{IN_PROGRESS_COUNT}</div>
<div style="font-size:0.7em; color:var(--color-muted); text-transform:uppercase; letter-spacing:.04em;">En cours</div>
</div>
<div style="text-align:center;">
<div style="font-size:2.2em; font-weight:700; color:#718096;">{TODO_COUNT}</div>
<div style="font-size:0.7em; color:var(--color-muted); text-transform:uppercase; letter-spacing:.04em;">À venir</div>
</div>
</div>

<div style="font-size:0.85em; color:var(--color-muted);">📅 {DATE_DEBUT} → {DATE_FIN} &nbsp;·&nbsp; {STATUT}</div>

</div>

</div>

<div class="slide-footer">
<small>Sprint Review — {NOM_PROJET} — {DATE_GENERATION}</small>
</div>

=== DATE ===
{{date}}
