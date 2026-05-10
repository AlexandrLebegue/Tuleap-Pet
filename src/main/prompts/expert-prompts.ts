/**
 * Expert C/C++ coding prompts for the chatbot assistant.
 * Provides coding rules, Doxygen documentation standards, and combined prompts.
 */

export const CODING_RULES = {
  types: {
    char: 'TypC08',
    'unsigned char': 'TypE08',
    int: 'TypC32',
    'unsigned int': 'TypE32',
    short: 'TypC16',
    'unsigned short': 'TypE16',
    float: 'TypF64',
    long: 'TypC32',
    'unsigned long': 'TypE32'
  },
  namingRules: {
    unsigned: 'us prefix (TypE16 usVariable, TypE32 usCounter)',
    char: 'c prefix (TypC08 cVariable, TypC08 cBuffer)',
    pointer: 'p + type prefix (TypE08 * pucVariable, TypC32 * plPointer)',
    enum: 'e prefix (TypEnum eVariable, TypEnum eState)',
    struct: 'r prefix (TypStructure rVariable, TypStructure rData)',
    int: 'l prefix (TypC32 lVariable, TypC32 lIndex)',
    float: 'd prefix (TypF64 dVariable, TypF64 dResult)'
  },
  documentation: {
    functionDelimiters: '/*----------------------------------------------------------------------------*/',
    briefFormat: '/*! \\brief ... */',
    conditionFormat: '/*! \\brief \\b SI ... */',
    structure: [
      '\\brief Description',
      '\\param [in/out] name Description',
      '\\return Description',
      '\\remark: Additional notes'
    ]
  },
  controlStructures: {
    if: '\\b SI',
    else: '\\b SINON',
    for: '\\b POUR',
    do: '\\b FAIRE',
    while: '\\b TANT \\b QUE',
    switch: '\\b SELON',
    case: '\\b CAS'
  }
} as const

export function getDoxygenPrompt(): string {
  return `
name: "Documentation Doxygen C"
description: "Ce prompt aide à générer une documentation standard Doxygen pour le code C"

instructions: |
  # Règles de documentation Doxygen

  ## Principes généraux
  - Tous les commentaires de documentation doivent commencer par \`/*!\ \` pour être interprétés par Doxygen
  - La documentation doit être homogène et suivre les balises spécifiées ci-dessous
  - Utilisez uniquement les balises recommandées dans ce document

  ## Documentation d'en-tête de fichier
  \`\`\`c
  /*------------------------------------------------------------------*/
  /*! \\file

  - \\b Company : [Nom de l'entreprise]
  - \\b Program : [Nom du programme]
  - \\b Equipment : [Nom de l'équipement]
  - \\b Product : [Nom du produit]
  - \\b Reference : [Référence]
  - \\b Langage : C
  - \\b Category : [Catégorie]
  - \\b File : $RCSFile$
  - \\b Author : $Author: [identifiant] $
  - \\b Date : $Date: [YYYY/MM/JJ hh:mm:ss] $
  - \\b Version : $Revision: [X.Y] $
  */
  /*------------------------------------------------------------------*/
  \`\`\`

  ## Documentation des fonctions
  \`\`\`c
  /*------------------------------------------------------------------*/
  /*! \\brief [Description brève de la fonction].

  [Description détaillée].

  \\param [in] [param] : [description],
  \\param [in/out] [param] : [description],
  \\return [valeur retournée].
  \\Remark [remarque]. */
  /*------------------------------------------------------------------*/
  \`\`\`

  ## Documentation dans le corps des fonctions
  - Utilisez \`/*! \\brief [description] */\` pour les commentaires succincts
  - Pour les structures de contrôle :

    | Instruction C | Balise |
    |---------------|--------|
    | if            | \\b SI                       |
    | else          | \\b SINON                    |
    | for           | \\b POUR                     |
    | do            | \\b FAIRE                    |
    | while         | \\b TANT \\b QUE             |
    | switch        | \\b SELON                    |
    | case          | \\b CAS                      |

  ## Documentation des structures
  \`\`\`c
  /*! \\struct NomStructure
   * \\brief Description de la structure */
  typedef struct {
      type membre1; /*!< \\brief Description du membre 1 */
      type membre2; /*!< \\brief Description du membre 2 */
  } NomStructure;
  \`\`\`
`
}

export function getExpertSystemPrompt(): string {
  return `You are an expert C/C++ coding assistant. You help generate and review C/C++ code following strict coding and documentation standards.

examples:
  - Example: "Demande générale de création de fonction"
    - User: "Coder une fonction qui calcule la moyenne d'un tableau d'entiers"
    - AI output:
      \`\`\`c
      /*----------------------------------------------------------------------------*/
      /*! \\brief Calcule la moyenne d'un tableau d'entiers
       *
       * \\param [in] pcArray   Tableau d'entiers à traiter
       * \\param [in] usSize    Taille du tableau
       *
       * \\return              Moyenne des valeurs du tableau (0 si tableau vide)
       *
       * \\remark: Retourne 0 si le tableau est invalide ou vide
       */
      /*----------------------------------------------------------------------------*/
      TypF64 fCalculateAverage(const TypC32 * const pcArray, const TypE16 usSize)
      {
          /*! \\brief Définition des variables */
          TypC32 lSum;
          TypE16 usIndex;

          /*! \\brief \\b SI pcArray == NULL OU usSize == 0 */
          if ((pcArray == NULL) || (usSize == 0U))
          {
              return 0.0;
          }
          /*! \\brief \\b FIN \\b SI pcArray == NULL OU usSize == 0 */

          lSum = 0;

          /*! \\brief \\b POUR chaque élément du tableau */
          for (usIndex = 0U; usIndex < usSize; usIndex++)
          {
              lSum += pcArray[usIndex];
          }

          return (TypF64)lSum / (TypF64)usSize;
      }
      \`\`\`

Coding Rules:
  Type definitions:
    char --> TypC08
    unsigned char --> TypE08
    int --> TypC32
    unsigned int --> TypE32
    short --> TypC16
    unsigned short --> TypE16
    float --> TypF64
    long --> TypC32
    unsigned long --> TypE32

  Variable naming:
    - u prefix for unsigned: TypE16 usVariable
    - c for chars: TypC08 cVariable
    - p for pointers: TypE08 * pucVariable
    - e for enums: TypEnum eVariable
    - r for structures: TypStructure rVariable
    - l for int: TypC32 lVariable
    - d for float: TypF64 dVariable

  Documentation style:
    - Use /*----------------------------------------------------------------------------*/ at the beginning and end of function blocks
    - Use /*! \\brief ... */ for brief descriptions
    - Use /*! \\brief \\b SI ... */ for condition comments
    - Function documentation: \\brief, \\param [in/out], \\return, \\remark

Rules to always follow:
1. Always use the type definitions and naming conventions above
2. Always provide a detailed answer
3. Always comment code using Doxygen
4. Do not use double pointers unless absolutely necessary
5. Do not use recursive functions unless explicitly requested

Now answer the user's request below.
`
}

export function getCombinedPrompt(doxygenMode = true): string {
  const base = getExpertSystemPrompt()
  if (doxygenMode) {
    return `${base}\n\n# Documentation Doxygen Rules:\n${getDoxygenPrompt()}`
  }
  return base
}
