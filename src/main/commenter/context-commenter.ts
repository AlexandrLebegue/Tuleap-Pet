import fs from 'node:fs'
import path from 'node:path'
import { resolveLlmProvider } from '../llm'
import { buildContext, buildProjectIndex, parseFile, renderContext } from '../cpp-analyzer'
import type { FunctionDef, ProjectIndex } from '../cpp-analyzer/types'
import { findExistingCommentRange, detectFunctionIndent } from './comment-locator'
import type { CommentRange } from './comment-locator'
import { evaluateCommentSufficiency } from './comment-evaluator'
import type { CommentEvaluation } from './comment-evaluator'

export type ContextCommenterProgress =
  | { type: 'index'; root: string }
  | { type: 'file-start'; filePath: string; total: number; functions: number }
  | { type: 'evaluate'; filePath: string; functionName: string; index: number; total: number }
  | { type: 'verdict'; functionName: string; sufficient: boolean; reason: string }
  | { type: 'generate'; functionName: string }
  | { type: 'file-done'; filePath: string; skipped: number; commented: number }
  | { type: 'done' }

export type ContextCommenterOptions = {
  projectRoot: string
  /** Files (absolute paths) to process. */
  filePaths: string[]
  /** When true, every function is regenerated regardless of evaluator verdict. */
  forceAll?: boolean
  depth?: number
  tokenBudget?: number
}

export type FunctionPlan = {
  fn: FunctionDef
  evaluation: CommentEvaluation
  existing: CommentRange | null
  newComment?: string
}

export type FileCommentResult = {
  filePath: string
  originalContent: string
  newContent: string
  plans: FunctionPlan[]
  skipped: number
  commented: number
}

export type ContextCommenterResult = {
  files: FileCommentResult[]
  warnings: string[]
}

const SYSTEM_PROMPT = `You are an expert in writing Doxygen function-level documentation for
industrial C/C++ code. You receive rich static context (the function, its
paired header, callers, callees) and produce ONLY a Doxygen comment block.
You do NOT modify the function body, never rename identifiers, and never
change types.`

function buildGeneratePrompt(args: {
  fn: FunctionDef
  ctxText: string
  indent: string
}): { system: string; user: string } {
  const user = `# CONTEXT

${args.ctxText}

# TASK

Produce ONLY the Doxygen comment block that should appear immediately above
the target function's signature. Format constraints (project convention):

\`\`\`
${args.indent}/*----------------------------------------------------------------------------*/
${args.indent}/*! \\brief <one-sentence summary>
${args.indent} *
${args.indent} * <longer description if the function is non-trivial>
${args.indent} *
${args.indent} * \\param [in] paramName : <description>  (use [out] / [in,out] as needed)
${args.indent} * \\return <description of the return value, or 'Néant' if void>
${args.indent} *
${args.indent} * \\remark <important caveats, or 'Néant'>
${args.indent} */
${args.indent}/*----------------------------------------------------------------------------*/
\`\`\`

Rules:
- Use \\param for every named parameter of \`${args.fn.signature}\`, in order.
- Reflect the actual implementation visible in the body. When the function
  calls into callees, mention the high-level behavior (do NOT just list call
  sites).
- Keep every line ≤ 100 characters and respect the indentation shown above.
- Output ONLY the comment block, between \`\`\`cpp and \`\`\`. No code, no
  function body, no commentary.`

  return { system: SYSTEM_PROMPT, user }
}

function extractCommentBlock(raw: string): string {
  const patterns = [/```cpp\s*([\s\S]*?)```/, /```c\s*([\s\S]*?)```/, /```\s*([\s\S]*?)```/]
  for (const p of patterns) {
    const m = raw.match(p)
    if (m?.[1]) return m[1].trimEnd()
  }
  return raw.trim()
}

async function callLlm(system: string, user: string, maxOutputTokens = 1024): Promise<string> {
  const provider = resolveLlmProvider()
  const result = await provider.generate({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.2,
    maxOutputTokens
  })
  return result.text
}

type Op = { startLine: number; endLineExclusive: number; replacement: string }

function applyOps(content: string, ops: Op[]): string {
  const sorted = [...ops].sort((a, b) => a.startLine - b.startLine)
  const lines = content.split('\n')
  const out: string[] = []
  let cursor = 0
  for (const op of sorted) {
    for (let i = cursor; i < op.startLine; i++) {
      const l = lines[i]
      out.push(l ?? '')
    }
    out.push(op.replacement)
    cursor = op.endLineExclusive
  }
  for (let i = cursor; i < lines.length; i++) {
    const l = lines[i]
    out.push(l ?? '')
  }
  return out.join('\n')
}

async function processFile(
  filePath: string,
  index: ProjectIndex,
  opts: ContextCommenterOptions,
  emit: (e: ContextCommenterProgress) => void
): Promise<FileCommentResult> {
  const originalContent = fs.readFileSync(filePath, 'utf8')
  const defs = parseFile(filePath, originalContent)
  emit({ type: 'file-start', filePath, total: defs.length, functions: defs.length })

  const plans: FunctionPlan[] = []
  for (let i = 0; i < defs.length; i++) {
    const fn = defs[i]!
    emit({ type: 'evaluate', filePath, functionName: fn.name, index: i + 1, total: defs.length })
    const existing = findExistingCommentRange(originalContent, fn.startLine)
    const context = buildContext(index, fn, { depth: opts.depth, tokenBudget: opts.tokenBudget })

    let evaluation: CommentEvaluation
    if (opts.forceAll) {
      evaluation = { sufficient: false, reason: 'forceAll option enabled', rawAnswer: '' }
    } else {
      try {
        evaluation = await evaluateCommentSufficiency({
          fn,
          existingComment: existing?.text ?? null,
          context
        })
      } catch (err) {
        evaluation = {
          sufficient: false,
          reason: `evaluator error: ${err instanceof Error ? err.message : String(err)}`,
          rawAnswer: ''
        }
      }
    }
    emit({
      type: 'verdict',
      functionName: fn.name,
      sufficient: evaluation.sufficient,
      reason: evaluation.reason
    })

    if (evaluation.sufficient) {
      plans.push({ fn, evaluation, existing })
      continue
    }

    emit({ type: 'generate', functionName: fn.name })
    const ctxText = renderContext(context)
    const indent = detectFunctionIndent(originalContent, fn.startLine)
    const { system, user } = buildGeneratePrompt({ fn, ctxText, indent })
    const raw = await callLlm(system, user)
    const newComment = extractCommentBlock(raw)
    plans.push({ fn, evaluation, existing, newComment })
  }

  // Splice the new comments. Operate on ranges so the existing comment is
  // *replaced* and the new comment is inserted immediately above the
  // function signature.
  const ops: Op[] = []
  for (const p of plans) {
    if (!p.newComment) continue
    const fnStartIdx = p.fn.startLine - 1
    if (p.existing) {
      // Replace [existing.startLine-1, existing.endLine] (exclusive end)
      ops.push({
        startLine: p.existing.startLine - 1,
        endLineExclusive: p.existing.endLine,
        replacement: p.newComment
      })
    } else {
      // Insert at the function signature line (no removal)
      ops.push({
        startLine: fnStartIdx,
        endLineExclusive: fnStartIdx,
        replacement: p.newComment
      })
    }
  }
  const newContent = applyOps(originalContent, ops)

  const skipped = plans.filter((p) => p.evaluation.sufficient).length
  const commented = plans.filter((p) => p.newComment).length
  emit({ type: 'file-done', filePath, skipped, commented })

  return { filePath, originalContent, newContent, plans, skipped, commented }
}

export async function runContextCommenter(
  opts: ContextCommenterOptions,
  onProgress?: (e: ContextCommenterProgress) => void
): Promise<ContextCommenterResult> {
  const emit = (e: ContextCommenterProgress): void => {
    onProgress?.(e)
  }
  emit({ type: 'index', root: opts.projectRoot })
  const index = buildProjectIndex(opts.projectRoot)

  const warnings: string[] = []
  const files: FileCommentResult[] = []
  for (const fp of opts.filePaths) {
    const abs = path.resolve(fp)
    if (!fs.existsSync(abs)) {
      warnings.push(`File not found: ${abs}`)
      continue
    }
    try {
      const res = await processFile(abs, index, opts, emit)
      files.push(res)
    } catch (err) {
      warnings.push(`${abs}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  emit({ type: 'done' })
  return { files, warnings }
}
