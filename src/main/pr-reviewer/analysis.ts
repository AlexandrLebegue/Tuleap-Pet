import { parseFile, stripCommentsAndStrings } from '../cpp-analyzer/parser'
import { findExistingCommentRange } from '../commenter/comment-locator'

/** Canonical C/C++ source/header extensions (aligné avec git-utils SOURCE_GLOBS). */
const CPP_EXTS = ['.c', '.h', '.cpp', '.hpp', '.cxx', '.hxx', '.cc']

export function isCppFile(p: string): boolean {
  const l = p.toLowerCase()
  return CPP_EXTS.some((e) => l.endsWith(e))
}

// ─── git diff --name-status parsing ──────────────────────────────────────────

export type FileChange = { status: string; path: string }

/**
 * Parse `git diff --name-status` output. Handles renames/copies (R100/C75)
 * where the destination path is the 3rd column.
 */
export function parseNameStatus(out: string): FileChange[] {
  const changes: FileChange[] = []
  for (const line of out.split('\n')) {
    const t = line.replace(/\r$/, '')
    if (!t.trim()) continue
    const parts = t.split('\t')
    const status = (parts[0] ?? '').trim()
    if (!status) continue
    const path =
      status.startsWith('R') || status.startsWith('C')
        ? (parts[2] ?? parts[1] ?? '')
        : (parts[1] ?? '')
    if (path) changes.push({ status, path })
  }
  return changes
}

/** Files added in the PR (git status `A`). */
export function newFiles(changes: FileChange[]): string[] {
  return changes.filter((c) => c.status.startsWith('A')).map((c) => c.path)
}

/** New files restricted to C/C++ sources/headers. */
export function newCppFiles(changes: FileChange[]): string[] {
  return newFiles(changes).filter(isCppFile)
}

// ─── diff line helpers ───────────────────────────────────────────────────────

/** Added lines of a unified diff (lines starting with `+`, excluding the `+++` header). */
export function addedLines(diff: string): string[] {
  return diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'))
}

// ─── tests ───────────────────────────────────────────────────────────────────

const GTEST_TEST_RE = /\bTEST(?:_F|_P)?\s*\(/g
const TEST_PATH_RE = /(?:^|\/)tests?\/|_test\.|\.test\.|(?:^|\/)test_|\.spec\./i

/** Compte les déclarations gtest (TEST/TEST_F/TEST_P) sur les lignes AJOUTÉES du diff. */
export function countAddedTests(diff: string): number {
  let count = 0
  for (const raw of addedLines(diff)) {
    const line = raw.slice(1) // strip leading '+'
    const m = line.match(GTEST_TEST_RE)
    if (m) count += m.length
  }
  return count
}

export function isTestPath(p: string): boolean {
  return TEST_PATH_RE.test(p)
}

/** Fichiers de test C/C++ ajoutés ou modifiés. */
export function changedTestFiles(changes: FileChange[]): string[] {
  return changes
    .filter(
      (c) =>
        (c.status.startsWith('A') || c.status.startsWith('M')) &&
        isCppFile(c.path) &&
        isTestPath(c.path)
    )
    .map((c) => c.path)
}

/** Nouveaux fichiers source C/C++ NON-test (candidats à devoir être testés). */
export function newNonTestCppFiles(changes: FileChange[]): string[] {
  return newCppFiles(changes).filter((p) => !isTestPath(p))
}

// ─── commit log ──────────────────────────────────────────────────────────────

export type CommitInfo = { hash: string; subject: string; author: string }

/** Parse `git log --pretty=format:%h\t%s\t%an`. */
export function parseCommitLog(out: string): CommitInfo[] {
  const commits: CommitInfo[] = []
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const [hash, subject, author] = line.split('\t')
    commits.push({ hash: hash ?? '', subject: subject ?? '', author: author ?? '' })
  }
  return commits
}

/** Parse `git diff --shortstat` → { filesChanged, added, removed }. */
export function parseShortStat(out: string): {
  filesChanged: number
  added: number
  removed: number
} {
  const files = out.match(/(\d+)\s+files?\s+changed/)
  const ins = out.match(/(\d+)\s+insertions?\(\+\)/)
  const del = out.match(/(\d+)\s+deletions?\(-\)/)
  return {
    filesChanged: files ? Number.parseInt(files[1]!, 10) : 0,
    added: ins ? Number.parseInt(ins[1]!, 10) : 0,
    removed: del ? Number.parseInt(del[1]!, 10) : 0
  }
}

// ─── LLM answer parsing ──────────────────────────────────────────────────────

/** Extrait un pourcentage (0-100) d'un texte LLM, ou null si absent/illisible. */
export function parsePercent(text: string): number | null {
  const m = text.match(/(\d{1,3}(?:\.\d+)?)\s*%/)
  if (!m) return null
  const v = Math.round(Number.parseFloat(m[1]!))
  if (!Number.isFinite(v)) return null
  return Math.max(0, Math.min(100, v))
}

/** Lit un verdict OUI/NON (ou YES/NO) en début de réponse LLM ; défaut = true (besoin de tests). */
export function parseNeedsTests(text: string): boolean {
  const head = text.trim().toUpperCase()
  if (
    /\b(NON|NO)\b/.test(head.split(/\s/)[0] ?? '') ||
    head.startsWith('NON') ||
    head.startsWith('NO')
  )
    return false
  if (head.startsWith('OUI') || head.startsWith('YES')) return true
  // Fallback prudent : si "non"/"no" apparaît tôt, considère pas besoin.
  return !/^\s*(non|no)\b/i.test(text.trim())
}

// ─── Coding-rules deterministic scoring (new C/C++ files) ────────────────────

const RAW_TYPE_RE = /\b(?:unsigned\s+)?(?:int|char|short|long|float|double)\b/g
const CUSTOM_TYPE_RE = /\bTyp(?:[CEF]\d{2}|Enum|Structure|[A-Z]\w*)\b/g

export type CodingRuleDeterministic = {
  /** % de fonctions (avec corps) précédées d'un bloc de commentaire. */
  docCoverage: number
  /** % de types "custom" (TypCxx/TypExx/…) vs types bruts (int/char/…). */
  typeConvention: number
  /** % de lignes non vides qui sont des commentaires. */
  commentDensity: number
  /** Moyenne des trois sous-scores. */
  overall: number
  functionsTotal: number
  functionsDocumented: number
}

export type SourceFile = { path: string; content: string }

export function scoreDoxygenCoverage(files: SourceFile[]): { total: number; documented: number } {
  let total = 0
  let documented = 0
  for (const f of files) {
    const fns = parseFile(f.path, f.content).filter((fn) => fn.hasBody)
    for (const fn of fns) {
      total++
      if (findExistingCommentRange(f.content, fn.startLine)) documented++
    }
  }
  return { total, documented }
}

export function scoreTypeConvention(files: SourceFile[]): number {
  let raw = 0
  let custom = 0
  for (const f of files) {
    const stripped = stripCommentsAndStrings(f.content)
    raw += (stripped.match(RAW_TYPE_RE) ?? []).length
    custom += (stripped.match(CUSTOM_TYPE_RE) ?? []).length
  }
  const denom = raw + custom
  if (denom === 0) return 100 // aucun type déclaré → pas de violation
  return Math.round((custom / denom) * 100)
}

export function scoreCommentDensity(files: SourceFile[]): number {
  let total = 0
  let comments = 0
  for (const f of files) {
    for (const line of f.content.split('\n')) {
      const t = line.trim()
      if (!t) continue
      total++
      if (/^(\/\/|\/\*|\*|#)/.test(t)) comments++
    }
  }
  if (total === 0) return 0
  return Math.round((comments / total) * 100)
}

export function scoreCodingRulesDeterministic(files: SourceFile[]): CodingRuleDeterministic {
  const dox = scoreDoxygenCoverage(files)
  const docCoverage = dox.total === 0 ? 0 : Math.round((dox.documented / dox.total) * 100)
  const typeConvention = scoreTypeConvention(files)
  const commentDensity = scoreCommentDensity(files)
  const overall = Math.round((docCoverage + typeConvention + commentDensity) / 3)
  return {
    docCoverage,
    typeConvention,
    commentDensity,
    overall,
    functionsTotal: dox.total,
    functionsDocumented: dox.documented
  }
}

/** Combine le score déterministe et le score LLM (50/50). Si pas de % LLM, garde le déterministe. */
export function combineCompliance(deterministic: number, llmPercent: number | null): number {
  if (llmPercent === null) return deterministic
  return Math.round((deterministic + llmPercent) / 2)
}
