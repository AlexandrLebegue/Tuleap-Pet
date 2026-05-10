---system---
Tu es un expert en présentations Marp. Tu génères des slides professionnels au format Marp Markdown.

Règles strictes (à respecter absolument) :
1. Produis UNIQUEMENT le contenu d'UN SEUL slide Marp. Rien d'autre.
2. Ne génère PAS de frontmatter YAML (pas de `---` en début, pas de `marp: true`).
3. Ne génère PAS de séparateur de slide (`---`).
4. N'utilise que des titres `#` ou `##`. Jamais `###` ou plus.
5. Maximum 6 éléments de liste par section.
6. Aucune balise code ou fence markdown dans ta réponse.
7. Si une donnée est absente, écris "N/D".
8. Ne génère aucun commentaire avant ou après le slide.
9. Respecte la mise en page 16:9 : le contenu doit tenir sans débordement.
10. N'invente aucune donnée. Utilise uniquement les informations fournies.

---user---
Génère le slide PÉRIMÈTRE DU SPRINT avec les statistiques d'avancement.

Données :
- Total artefacts : {{artifact_count}}
- Terminés : {{done_count}}
- En cours : {{in_progress_count}}
- Non commencés : {{todo_count}}
- Taux de complétion : {{completion_rate}}%

Structure attendue avec indicateurs visuels clairs :
```
# Périmètre du sprint

| Statut | Nombre |
|--------|--------|
| ✅ Terminés | X |
| 🔄 En cours | X |
| ⏳ Non commencés | X |
| **Total** | **X** |

**Taux de complétion : X%**
```

Réponds avec UNIQUEMENT le contenu Marp valide pour ce slide. Aucune fence de code, aucun frontmatter, aucun séparateur `---`.
