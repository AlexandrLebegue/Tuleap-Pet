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
Génère le slide AGENDA pour cette présentation Sprint Review.

Résumé du sprint (pour identifier les sections réelles) :
{{summary}}

L'agenda doit lister les 9 sections de la présentation dans l'ordre :
1. Titre
2. Agenda
3. Périmètre du sprint
4. Éléments terminés
5. Éléments en cours
6. Éléments non commencés
7. Points saillants
8. Prochaines étapes
9. Conclusion

Structure attendue :
```
# Agenda

1. Périmètre du sprint
2. Éléments terminés
3. Éléments en cours
4. Éléments non commencés
5. Points saillants
6. Prochaines étapes
7. Conclusion
```

Réponds avec UNIQUEMENT le contenu Marp valide pour ce slide. Aucune fence de code, aucun frontmatter, aucun séparateur `---`.
