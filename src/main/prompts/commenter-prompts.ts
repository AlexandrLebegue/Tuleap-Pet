/**
 * Prompts for the automatic code commenter tool.
 * Handles Doxygen documentation generation with optional coding rule enforcement.
 */

export type CommentingOptions = {
  preserveExisting: boolean
  addFileHeader: boolean
  detailedComments: boolean
  applyCodingRules: boolean
}

export const DEFAULT_COMMENTING_OPTIONS: CommentingOptions = {
  preserveExisting: true,
  addFileHeader: true,
  detailedComments: true,
  applyCodingRules: false
}

export const SUPPORTED_EXTENSIONS = ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx']

export function isSupported(filename: string): boolean {
  return SUPPORTED_EXTENSIONS.some((ext) => filename.toLowerCase().endsWith(ext))
}

export function getCommenterSystemPrompt(): string {
  return `Tu es un expert en documentation de code C/C++. \
Ta mission est d'analyser du code C/C++ et d'ajouter une documentation complète suivant les standards Doxygen.

🔑 RÈGLE FONDAMENTALE : LIS ATTENTIVEMENT LES OPTIONS DANS LE PROMPT UTILISATEUR !

**COMPORTEMENT PAR DÉFAUT : DOCUMENTATION SEULEMENT**
- Ajoute UNIQUEMENT la documentation manquante sans modifier les noms de variables ni les types
- Préserve exactement le code original et ne change que les commentaires
- N'applique les règles de codage (renommage) que si EXPLICITEMENT demandé dans les options

**SI "applyCodingRules" EST ACTIVÉ dans les options :**
- APPLIQUE OBLIGATOIREMENT les règles de codage
- RENOMME TOUTES les variables selon les conventions
- CONVERTIS TOUS les types selon le mapping

**SI "applyCodingRules" N'EST PAS ACTIVÉ (par défaut) :**
- NE CHANGE AUCUN nom de variable
- NE CHANGE AUCUN type
- AJOUTE SEULEMENT la documentation

1. **Documentation des fonctions** (FORMAT OBLIGATOIRE) :

   /*----------------------------------------------------------------------------*/
   /*! \\brief Description brève de la fonction
    *
    * Description détaillée de la fonction sur plusieurs lignes si nécessaire.
    *
    * \\param [in] paramName : Description du paramètre d'entrée
    * \\param [out] paramName : Description du paramètre de sortie
    * \\param [in/out] paramName : Description du paramètre d'entrée/sortie
    *
    * \\return Description de la valeur de retour
    *
    * \\remark: Remarques importantes sur l'utilisation
    */
   /*----------------------------------------------------------------------------*/

2. **Documentation dans le corps des fonctions** :
   - Déclarer toutes les variables en début de fonction avec : /*! \\brief Définition des variables */
   - Commenter chaque bloc logique avec : /*! \\brief Description de l'action */
   - Pour les conditions, utiliser : /*! \\brief \\b SI condition */ et /*! \\brief \\b SINON */
   - Pour les boucles : /*! \\brief \\b POUR chaque élément */
   - Fermer les blocs avec : /*! \\brief \\b FIN \\b SI condition */

3. **Documentation d'en-tête de fichier** :

   /*----------------------------------------------------------------------------*/
   /*! \\file nom_du_fichier.c

     - \\b Company : [Company]
     - \\b Program : [Nom du programme]
     - \\b Langage : C

     \\brief Description du fichier et de son rôle
   */
   /*----------------------------------------------------------------------------*/

4. **Documentation des structures et définitions** :

   /*! \\brief Description de la structure */
   typedef struct {
       int member1; /*!< \\brief Description du membre 1 */
       unsigned short member2; /*!< \\brief Description du membre 2 */
   } StructureName;

   /*! \\brief Description de la définition */
   #define CONSTANT_NAME 42

**RÈGLES DE CODAGE (SEULEMENT SI OPTION ACTIVÉE)**

Si l'option "applyCodingRules" est activée :

5. **Types de données** :
   - char → TypC08
   - unsigned char → TypE08
   - int → TypC32
   - unsigned int → TypE32
   - short → TypC16
   - unsigned short → TypE16
   - float → TypF64
   - long → TypC32
   - unsigned long → TypE32

6. **CONVENTIONS DE NOMMAGE DES VARIABLES** :
   - Variables unsigned : préfixe 'us' → TypE16 usNomVariable
   - Variables char : préfixe 'c' → TypC08 cCaractere
   - Pointeurs : préfixe 'p' + type → TypE08 * pucPointeur
   - Enums : préfixe 'e' → TypEnum eEtatMachine
   - Structures : préfixe 'r' → TypStructure rDonnees
   - Variables int : préfixe 'l' → TypC32 lCompteur
   - Variables float : préfixe 'd' → TypF64 dValeur

INSTRUCTIONS CRITIQUES :
- LIS LES OPTIONS dans le prompt utilisateur pour savoir quoi faire
- Par défaut, ajoute UNIQUEMENT la documentation sans changer le code
- Garde la même indentation et formatage du code original
- NE METS JAMAIS le code dans des blocs de code markdown avec \`\`\`c ou \`\`\`
- Réponds directement avec le code C documenté, sans aucun formatage markdown
- Le code retourné doit être directement utilisable sans modification
`
}

export function buildUserPrompt(filename: string, content: string, options: CommentingOptions): string {
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase()
  const isHeader = ['.h', '.hpp', '.hxx'].includes(ext)

  let additions = ''

  if (!options.preserveExisting) {
    additions += '\n- Remplace tous les commentaires existants par la nouvelle documentation.'
  }
  if (options.addFileHeader) {
    additions += '\n- Ajoute obligatoirement l\'en-tête de fichier.'
  }
  if (options.detailedComments) {
    additions += '\n- Génère des commentaires très détaillés pour chaque bloc de code.'
  }
  if (options.applyCodingRules) {
    additions += '\n- APPLIQUE OBLIGATOIREMENT LES RÈGLES DE CODAGE : Change les types ET renomme toutes les variables selon les conventions.'
    additions += '\n- TRANSFORMATION OBLIGATOIRE : int → TypC32 avec préfixe \'l\', unsigned int → TypE32 avec préfixe \'us\', char → TypC08 avec préfixe \'c\', etc.'
    additions += '\n- RENOMME TOUTES LES VARIABLES : Aucune variable ne doit garder son nom original !'
  } else {
    additions += '\n- MODE DOCUMENTATION SEULE : N\'applique PAS les règles de codage, préserve TOUS les noms de variables et types originaux.'
    additions += '\n- PRÉSERVATION TOTALE : Garde exactement les mêmes noms de variables et types qu\'en entrée.'
  }

  if (isHeader) {
    additions += options.applyCodingRules
      ? '\n- FICHIER EN-TÊTE : Documente toutes les déclarations publiques avec renommage obligatoire.'
      : '\n- FICHIER EN-TÊTE : Documente toutes les déclarations publiques en préservant les noms originaux.'
  }

  const examplesPrompt = options.applyCodingRules
    ? `
RÈGLES DE CODAGE ACTIVÉES - TRANSFORMATIONS OBLIGATOIRES :
- TOUTE variable 'int xxx' DOIT devenir 'TypC32 lXxx'
- TOUTE variable 'unsigned int xxx' DOIT devenir 'TypE32 usXxx'
- TOUTE variable 'char xxx' DOIT devenir 'TypC08 cXxx'
- TOUT pointeur 'char* xxx' DOIT devenir 'TypC08 * pcXxx'
- TOUT pointeur 'unsigned char* xxx' DOIT devenir 'TypE08 * pucXxx'
- TOUTE variable 'float xxx' DOIT devenir 'TypF64 dXxx'

APPLIQUE CES TRANSFORMATIONS À TOUTES LES VARIABLES SANS EXCEPTION !
`
    : `
MODE DOCUMENTATION SEULE ACTIVÉ :
- PRÉSERVE tous les noms de variables originaux (int xxx reste int xxx)
- PRÉSERVE tous les types originaux exactement
- AJOUTE uniquement la documentation Doxygen
- Ne modifie AUCUN nom de variable ou type dans le code
`

  return `Fichier: ${filename}\n\nOptions spéciales:${additions}${examplesPrompt}\n\nCode à documenter:\n${content}`
}

export const DOXYGEN_TEMPLATES = {
  fileHeader: (filename: string, description: string) => `\
/*----------------------------------------------------------------------------*/
/*! \\file ${filename}

  - \\b Company : [Company]
  - \\b Program : [Program name]
  - \\b Langage : C

  \\brief ${description}
*/
/*----------------------------------------------------------------------------*/`,

  functionHeader: (brief: string, params: string, returnDesc: string) => `\
/*----------------------------------------------------------------------------*/
/*! \\brief ${brief}
 *
 * \\param [in] param : ${params}
 *
 * \\return ${returnDesc}
 *
 * \\remark: Néant
 */
/*----------------------------------------------------------------------------*/`,

  structDoc: (structName: string, description: string) =>
    `/*! \\brief ${description} */\ntypedef struct {\n    /* members */\n} ${structName};`,

  defineDoc: (name: string, description: string) => `/*! \\brief ${description} */\n#define ${name}`,

  enumDoc: (name: string, description: string) => `/*! \\brief ${description} */\ntypedef enum {\n    /* values */\n} ${name};`
}

export const CONTROL_STRUCTURE_PATTERNS = {
  if: '/*! \\brief \\b SI {condition} */',
  else: '/*! \\brief \\b SINON */',
  elseIf: '/*! \\brief \\b SINON \\b SI {condition} */',
  for: '/*! \\brief \\b POUR {description} */',
  while: '/*! \\brief \\b TANT \\b QUE {condition} */',
  doWhile: '/*! \\brief \\b FAIRE {action} \\b TANT \\b QUE {condition} */',
  switch: '/*! \\brief \\b SELON {variable} */',
  case: '/*! \\brief \\b CAS {value} */',
  default: '/*! \\brief \\b CAS par défaut */',
  blockEnd: '/*! \\brief \\b FIN \\b {type} */',
  variableDecl: '/*! \\brief Définition des variables */'
}
