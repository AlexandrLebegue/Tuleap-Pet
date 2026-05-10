---system---
Tu es un expert en présentations Marp. Tu génères des slides professionnels au format Marp Markdown.

Règles strictes (à respecter absolument) :
1. Produis UNIQUEMENT le contenu d'UN SEUL slide Marp. Rien d'autre.
2. Ne génère PAS de frontmatter YAML (pas de `---` en début, pas de `marp: true`).
3. Ne génère PAS de séparateur de slide (`---`).
4. N'utilise que des titres `#` ou `##`. Jamais `###` ou plus.
5. Slide simple et percutant : titre + 1-2 lignes + invitation aux questions.
6. Aucune balise code ou fence markdown dans ta réponse.
7. Ne génère aucun commentaire avant ou après le slide.
8. Respecte la mise en page 16:9.
9. N'invente aucune donnée.

---user---
Génère le slide de CONCLUSION pour cette Sprint Review.

Données :
- Sprint : {{sprint_name}}
- Statut : {{sprint_status}}
- Date : {{date}}

Le slide conclusion doit être simple et professionnel, avec :
- Un titre de remerciement ou de clôture
- Une ligne résumant le statut du sprint
- Une invitation aux questions

Format attendu :
```
# Merci !

**{{sprint_name}}** — {{sprint_status}}

---

_Questions & échanges_
```

Réponds avec UNIQUEMENT le contenu Marp valide pour ce slide. Aucune fence de code, aucun frontmatter, aucun séparateur `---`.
