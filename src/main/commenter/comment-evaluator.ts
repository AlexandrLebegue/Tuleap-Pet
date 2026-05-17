import { resolveLlmProvider } from '../llm'
import type { EnrichedContext, FunctionDef } from '../cpp-analyzer/types'

export type CommentEvaluation = {
  sufficient: boolean
  reason: string
  rawAnswer: string
}

const SYSTEM_PROMPT = `You are a strict reviewer of C/C++ inline documentation. Your job is to
decide whether a function already has SUFFICIENT documentation according to
the project's Doxygen conventions (\\brief, \\param, \\return). You answer
with a single, structured line.`

const EVAL_FORMAT = `Reply on EXACTLY ONE line, in this exact format (no Markdown, no quotes):
<YES|NO> | <short reason, max 25 words>

Rules:
- YES if the comment describes what the function does AND every parameter AND
  the return value (parameters that don't exist or void return are implicitly OK).
- YES if a free-standing brief paragraph adequately covers the contract even
  without per-parameter \\param tags, provided the function is trivial (≤ 5
  lines of body) and the brief paragraph is unambiguous.
- NO if there is no comment at all.
- NO if the comment is outdated, misleading, contradicts the signature, or
  fails to mention important callees / side-effects visible in the body.`

export type BuildEvalPromptArgs = {
  fn: FunctionDef
  existingComment: string | null
  context: EnrichedContext
}

function summarizeCallees(ctx: EnrichedContext): string {
  if (ctx.calleesTree.length === 0) return '(none)'
  return ctx.calleesTree
    .map((e) => `- depth=${e.depth} ${e.fn.qualifiedName}`)
    .slice(0, 8)
    .join('\n')
}

export function buildEvalPrompt(args: BuildEvalPromptArgs): { system: string; user: string } {
  const existing = args.existingComment?.trim()
    ? args.existingComment.trim()
    : '(no comment block above the function)'

  const user = `# Function (signature + body)
\`\`\`cpp
${args.fn.body}
\`\`\`

# Existing comment block immediately above the function
${existing}

# Callees of this function (BFS depth ≤ ${args.context.calleesTree[0]?.depth ?? 0})
${summarizeCallees(args.context)}

# Task
${EVAL_FORMAT}`

  return { system: SYSTEM_PROMPT, user }
}

export function parseEvaluation(answer: string): CommentEvaluation {
  const line = answer.trim().split('\n').find((l) => l.trim().length > 0) ?? ''
  const cleaned = line.replace(/[*_`]/g, '').trim()
  const parts = cleaned.split('|').map((p) => p.trim())
  const verdict = (parts[0] ?? '').toUpperCase()
  const reason = parts.slice(1).join(' | ').trim() || cleaned
  if (verdict.startsWith('YES')) return { sufficient: true, reason, rawAnswer: answer }
  if (verdict.startsWith('NO')) return { sufficient: false, reason, rawAnswer: answer }
  // Defensive: if the model deviated, fall back to "needs commenting" so we
  // err on the side of doing the work rather than silently skipping.
  return { sufficient: false, reason: `unparseable answer (defaulting to NO): ${cleaned}`, rawAnswer: answer }
}

export async function evaluateCommentSufficiency(
  args: BuildEvalPromptArgs
): Promise<CommentEvaluation> {
  const { system, user } = buildEvalPrompt(args)
  const provider = resolveLlmProvider()
  const result = await provider.generate({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0,
    maxOutputTokens: 200
  })
  return parseEvaluation(result.text)
}
