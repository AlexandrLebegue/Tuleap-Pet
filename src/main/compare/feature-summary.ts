import { resolveLlmProvider } from '../llm'
import { truncateDiff } from './diff-utils'
import { debugError } from '../logger'
import type { BranchCompareCommit } from '@shared/types'

/** Max diff characters fed to the LLM (keeps the request within a sane budget). */
const DIFF_BUDGET = 14000

export type SummarizeInput = {
  vcs: 'git' | 'svn'
  base: string
  compare: string
  diff: string
  commits: BranchCompareCommit[]
}

/**
 * Ask the configured LLM to summarise — in Markdown, in French — the differences
 * between two branches/paths and the **new features** implemented in `compare`
 * relative to `base`. Returns a fallback note (never throws) so the diff is still
 * shown when the LLM is unavailable.
 */
export async function summarizeBranchDiff(input: SummarizeInput): Promise<string> {
  const { text: diffSample, truncated } = truncateDiff(input.diff, DIFF_BUDGET)
  if (input.diff.trim().length === 0) {
    return '_Aucune différence entre les deux branches._'
  }

  const commitList =
    input.commits.length > 0
      ? input.commits
          .slice(0, 50)
          .map((c) => `- \`${c.id}\` ${c.title}${c.authorName ? ` (${c.authorName})` : ''}`)
          .join('\n')
      : '_(aucun commit isolé disponible)_'

  const prompt = `Tu analyses la différence entre deux ${
    input.vcs === 'git' ? 'branches git' : 'chemins SVN'
  } d'un projet C/C++.

Base (référence) : \`${input.base}\`
Comparée (nouveautés) : \`${input.compare}\`

# Commits / révisions propres à la branche comparée (${input.commits.length})
${commitList}

# Diff unifié${truncated ? ' (tronqué)' : ''}
\`\`\`diff
${diffSample}
\`\`\`

Rédige en **Markdown**, en français, un compte-rendu structuré :

## ✨ Nouvelles fonctionnalités
Liste à puces des fonctionnalités / comportements ajoutés dans \`${input.compare}\` par rapport à \`${input.base}\` (déduits du code et des messages de commit).

## 🔧 Autres changements
Refactors, corrections, changements techniques notables.

## 📂 Portée
Fichiers/zones principalement touchés et impact éventuel (API, compatibilité).

Sois concis et factuel. Si une section est vide, omets-la. N'invente rien qui ne soit pas étayé par le diff ou les commits.`

  try {
    const provider = resolveLlmProvider()
    const res = await provider.generate({
      messages: [
        {
          role: 'system',
          content:
            'Tu es un expert en revue de code C/C++. Tu résumes des différences de branches de façon concise, factuelle et structurée en Markdown.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      maxOutputTokens: 1500
    })
    return res.text.trim() || '_Résumé IA vide._'
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    debugError('[compare] LLM summary failed: %s', msg)
    return `_Résumé IA indisponible (${msg}). Le diff ci-dessous reste exploitable._`
  }
}
