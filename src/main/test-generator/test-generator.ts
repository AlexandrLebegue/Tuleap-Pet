import { resolveLlmProvider } from '../llm'
import { extractFunctionsFromFile } from '../parser/code-parser'
import type { ParsedFunction, FileInfo } from '../parser/code-parser'

export type { ParsedFunction, FileInfo }

export type TestCase = {
  id: string
  category: string
  name: string
  description: string
  objective: string
  inputValues: string
  expectedOutput: string
}

export type TestFile = { name: string; content: string }

export type GenerationMetrics = {
  apiCalls: number
  testsGenerated: number
  testsFailed: number
  totalTime: number
}

export type GranularResult = {
  fileInfo: FileInfo
  functions: ParsedFunction[]
  testFiles: TestFile[]
  metrics: GenerationMetrics
}

// ────────────────────────────────────────────────────────────
// Step 1: Extract functions (programmatic, no AI)
// ────────────────────────────────────────────────────────────

export function extractFunctions(content: string, filename: string) {
  return extractFunctionsFromFile(content, filename)
}

// ────────────────────────────────────────────────────────────
// Step 2: List test cases (plain text, AI call)
// ────────────────────────────────────────────────────────────

const LIST_TESTS_C_PROMPT = `Tu es un expert en tests unitaires C.

Pour la fonction C suivante, liste les cas de test nécessaires.
Réponds avec UNE LIGNE par cas de test, format pipe-délimité :
numéro | catégorie | nom_test | description | objectif | valeurs_entrée | résultat_attendu

Catégories possibles : nominal, limite, erreur, special, memory, logic

FONCTION :
Nom: {function_name}
Signature: {signature}
Code source:
{source_code}

Exemple de format attendu :
1 | nominal | test_func_basic | Test basique avec valeurs normales | Vérifier fonctionnement normal | param1=5, param2=3 | retourne 8
2 | erreur | test_func_null | Test avec pointeur NULL | Vérifier gestion NULL | ptr=NULL | retourne -1

Fournis UNIQUEMENT les lignes de cas de test, sans explications.`

const LIST_TESTS_PYTHON_PROMPT = `Tu es un expert en tests unitaires Python.

Pour la fonction Python suivante, liste les cas de test nécessaires.
Réponds avec UNE LIGNE par cas de test, format pipe-délimité :
numéro | catégorie | nom_test | description | objectif | valeurs_entrée | résultat_attendu

Catégories possibles : nominal, limite, erreur, special, exception

FONCTION :
Nom: {function_name}
Signature: {signature}
Code source:
{source_code}

Exemple de format attendu :
1 | nominal | test_func_basic | Test basique avec valeurs normales | Vérifier fonctionnement normal | arg1=5, arg2=3 | retourne 8
2 | erreur | test_func_invalid | Test avec argument invalide | Vérifier gestion d'erreur | arg1=None | lève ValueError

Fournis UNIQUEMENT les lignes de cas de test, sans explications.`

function parseTestList(response: string, functionName: string): TestCase[] {
  const cases: TestCase[] = []
  for (const line of response.trim().split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.split('|').length < 3) continue
    const parts = trimmed.split('|').map((p) => p.trim())
    const idx = parseInt((parts[0] ?? '').replace('.', ''))
    if (isNaN(idx)) continue
    cases.push({
      id: `TC_${String(idx).padStart(3, '0')}`,
      category: parts[1] ?? 'nominal',
      name: parts[2] ?? `test_${functionName}_${idx}`,
      description: parts[3] ?? '',
      objective: parts[4] ?? '',
      inputValues: parts[5] ?? '',
      expectedOutput: parts[6] ?? ''
    })
  }
  if (cases.length === 0) {
    cases.push({
      id: 'TC_001',
      category: 'nominal',
      name: `test_${functionName}_nominal`,
      description: `Test nominal de ${functionName}`,
      objective: `Vérifier le fonctionnement normal de ${functionName}`,
      inputValues: '',
      expectedOutput: ''
    })
  }
  return cases
}

export async function listTestCases(func: ParsedFunction, isPython = false): Promise<TestCase[]> {
  const provider = resolveLlmProvider()
  const template = isPython ? LIST_TESTS_PYTHON_PROMPT : LIST_TESTS_C_PROMPT
  const prompt = template
    .replace('{function_name}', func.name)
    .replace('{signature}', func.signature)
    .replace('{source_code}', func.sourceCode)

  const result = await provider.generate({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
    maxOutputTokens: 2048
  })

  return parseTestList(result.text, func.name)
}

// ────────────────────────────────────────────────────────────
// Step 3: Write single test (AI call)
// ────────────────────────────────────────────────────────────

const WRITE_TEST_C_PROMPT = `Tu es un expert en tests unitaires C avec Google Test.

Écris le corps d'UN SEUL test unitaire (macro TEST) pour le cas suivant.
Ne mets PAS de #include ni de fonction main. Juste la macro TEST.

FONCTION À TESTER :
Nom: {function_name}
Signature: {signature}

CAS DE TEST :
ID: {test_id}
Catégorie: {test_category}
Nom: {test_name}
Description: {test_description}
Valeurs d'entrée: {test_inputs}
Résultat attendu: {test_expected}

Réponds UNIQUEMENT avec le code du TEST, entre \`\`\`cpp et \`\`\`.`

const WRITE_TEST_PYTHON_PROMPT = `Tu es un expert en tests unitaires Python avec pytest.

Écris le corps d'UNE SEULE fonction de test (def test_...) pour le cas suivant.
Ne mets PAS d'import. Juste la fonction def test_...

MODULE À IMPORTER: {module_name}
FONCTION À TESTER :
Nom: {function_name}
Signature: {signature}

CAS DE TEST :
ID: {test_id}
Catégorie: {test_category}
Nom: {test_name}
Description: {test_description}
Valeurs d'entrée: {test_inputs}
Résultat attendu: {test_expected}

Réponds UNIQUEMENT avec le code de la fonction, entre \`\`\`python et \`\`\`.`

function extractCodeBlock(response: string, lang: 'cpp' | 'python'): string {
  const patterns = lang === 'cpp'
    ? [/```cpp\s*([\s\S]*?)```/, /```c\+\+\s*([\s\S]*?)```/, /```c\s*([\s\S]*?)```/]
    : [/```python\s*([\s\S]*?)```/, /```py\s*([\s\S]*?)```/]

  for (const pat of patterns) {
    const m = response.match(pat)
    if (m?.[1]) return m[1].trim()
  }
  // fallback: return whole response stripped
  return response.trim()
}

export async function writeSingleTest(
  func: ParsedFunction,
  testCase: TestCase,
  fileInfo: FileInfo,
  isPython = false
): Promise<string> {
  const provider = resolveLlmProvider()

  const prompt = isPython
    ? WRITE_TEST_PYTHON_PROMPT
        .replace('{module_name}', fileInfo.name.replace(/\.py$/, ''))
        .replace('{function_name}', func.name)
        .replace('{signature}', func.signature)
        .replace('{test_id}', testCase.id)
        .replace('{test_category}', testCase.category)
        .replace('{test_name}', testCase.name)
        .replace('{test_description}', testCase.description)
        .replace('{test_inputs}', testCase.inputValues)
        .replace('{test_expected}', testCase.expectedOutput)
    : WRITE_TEST_C_PROMPT
        .replace('{function_name}', func.name)
        .replace('{signature}', func.signature)
        .replace('{test_id}', testCase.id)
        .replace('{test_category}', testCase.category)
        .replace('{test_name}', testCase.name)
        .replace('{test_description}', testCase.description)
        .replace('{test_inputs}', testCase.inputValues)
        .replace('{test_expected}', testCase.expectedOutput)

  const result = await provider.generate({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
    maxOutputTokens: 2048
  })

  return extractCodeBlock(result.text, isPython ? 'python' : 'cpp')
}

// ────────────────────────────────────────────────────────────
// Step 4: Assemble test file (programmatic, no AI)
// ────────────────────────────────────────────────────────────

function assembleCppTestFile(funcName: string, blocks: string[], fileInfo: FileInfo): string {
  const headerFile = fileInfo.headerFile ?? fileInfo.name.replace(/\.c$/, '.h')
  const parts = [
    `/*! \\file Fichier de test pour ${funcName} */`,
    '',
    'extern "C"',
    '{',
    `#include "${headerFile}"`,
    '}',
    '',
    '#include "gtest/gtest.h"',
    '',
    '//----------------------------------------------------------------------',
    `//                        Tests de ${funcName}`,
    '//----------------------------------------------------------------------',
    ''
  ]
  for (const block of blocks) {
    parts.push(block.trim())
    parts.push('')
  }
  parts.push(
    'int main(int argc, char **argv)',
    '{',
    '    testing::InitGoogleTest(&argc, argv);',
    '    return RUN_ALL_TESTS();',
    '}'
  )
  return parts.join('\n')
}

function assemblePythonTestFile(funcName: string, blocks: string[], fileInfo: FileInfo): string {
  const moduleName = fileInfo.name.replace(/\.py$/, '')
  const parts = [
    'import pytest',
    'import sys',
    'import os',
    '',
    'this_script_path = os.path.dirname(os.path.abspath(__file__))',
    'source_path = os.path.dirname(this_script_path)',
    'if source_path not in sys.path:',
    '    sys.path.insert(0, source_path)',
    '',
    `from ${moduleName} import ${funcName}`,
    '',
    ''
  ]
  for (const block of blocks) {
    parts.push(block.trim())
    parts.push('')
    parts.push('')
  }
  return parts.join('\n').trimEnd() + '\n'
}

// ────────────────────────────────────────────────────────────
// Orchestrator
// ────────────────────────────────────────────────────────────

export async function generateTestsGranular(
  content: string,
  filename: string,
  onProgress?: (step: string, detail: string, pct: number) => void
): Promise<GranularResult> {
  const isPython = filename.endsWith('.py')
  const metrics: GenerationMetrics = { apiCalls: 0, testsGenerated: 0, testsFailed: 0, totalTime: 0 }
  const t0 = Date.now()

  onProgress?.('extraction', `Extraction des fonctions de ${filename}…`, 0)
  const extraction = extractFunctions(content, filename)
  const functions = extraction.functions
  const fileInfo = extraction.fileInfo as FileInfo
  const testFiles: TestFile[] = []

  const total = functions.length
  for (let fi = 0; fi < total; fi++) {
    const func = functions[fi]
    if (!func) continue
    const basePct = fi / total

    onProgress?.('list_tests', `Listing tests pour ${func.name} (${fi + 1}/${total})…`, basePct * 0.9)

    let testCases: TestCase[]
    try {
      testCases = await listTestCases(func, isPython)
      metrics.apiCalls++
    } catch (e) {
      testCases = [{
        id: 'TC_001', category: 'nominal',
        name: `test_${func.name}_nominal`,
        description: `Test nominal de ${func.name}`,
        objective: '', inputValues: '', expectedOutput: ''
      }]
    }

    const blocks: string[] = []
    for (let ti = 0; ti < testCases.length; ti++) {
      const tc = testCases[ti]
      if (!tc) continue
      const innerPct = basePct + (ti / testCases.length) * (1 / total) * 0.9
      onProgress?.('write_test', `Écriture ${tc.name} (${ti + 1}/${testCases.length}) pour ${func.name}…`, innerPct)

      try {
        const block = await writeSingleTest(func, tc, fileInfo, isPython)
        blocks.push(block)
        metrics.testsGenerated++
      } catch (e) {
        const errComment = isPython
          ? `# ERREUR: Génération échouée pour ${tc.name}: ${e}`
          : `// ERREUR: Génération échouée pour ${tc.name}: ${e}`
        blocks.push(errComment)
        metrics.testsFailed++
      }
      metrics.apiCalls++
    }

    onProgress?.('assemble', `Assemblage fichier de test pour ${func.name}…`, basePct + (1 / total) * 0.95)
    const assembled = isPython
      ? assemblePythonTestFile(func.name, blocks, fileInfo)
      : assembleCppTestFile(func.name, blocks, fileInfo)

    const ext = isPython ? '.py' : '.cpp'
    testFiles.push({ name: `test_${func.name}${ext}`, content: assembled })
  }

  onProgress?.('done', 'Génération terminée.', 1)
  metrics.totalTime = (Date.now() - t0) / 1000

  return { fileInfo, functions, testFiles, metrics }
}
