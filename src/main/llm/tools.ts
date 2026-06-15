import { z } from 'zod'
import { tool, type Tool } from 'ai'
import {
  TuleapError,
  buildTuleapClient,
  mapArtifactDetail,
  mapArtifactSummary,
  mapMilestone,
  mapTracker
} from '../tuleap'
import { getConfig } from '../store/config'
import { audit } from '../store/db'
import type { ArtifactSummaryRaw } from '../tuleap/schemas'

function matchesAssignee(raw: ArtifactSummaryRaw, needle: string): boolean {
  const values = (raw as unknown as { values?: unknown[] }).values
  if (!Array.isArray(values)) return false

  for (const v of values) {
    if (!v || typeof v !== 'object') continue
    const field = v as Record<string, unknown>
    const label = String(field['label'] ?? '').toLowerCase()
    const type = String(field['type'] ?? '').toLowerCase()

    const isUserField = type === 'sb' || type === 'msb'
    const isAssignField =
      label.includes('assign') || label.includes('assigné') || label.includes('responsable')
    if (!isUserField && !isAssignField) continue

    const checkUser = (u: unknown): boolean => {
      if (!u || typeof u !== 'object') return false
      const obj = u as Record<string, unknown>
      return [obj['display_name'], obj['real_name'], obj['username']]
        .filter((n): n is string => typeof n === 'string' && n.length > 0)
        .some((n) => n.toLowerCase().includes(needle))
    }

    const fieldValues = field['values']
    if (Array.isArray(fieldValues) && fieldValues.some(checkUser)) return true

    if (checkUser(field['value'])) return true
  }

  return false
}

function projectIdOrThrow(): number {
  const id = getConfig().projectId
  if (typeof id !== 'number') {
    throw new TuleapError('unknown', "Aucun projet sélectionné dans Réglages.")
  }
  return id
}

/**
 * Tools exposed to the chat model. Every tool reuses the encrypted Tuleap
 * credentials from the main process — the LLM never sees the secret.
 *
 * The tool list is intentionally small and read-only for now: write
 * operations against Tuleap (creating artifacts, transitions) are deferred
 * until we have an audit + confirm UX.
 */
export function buildTuleapTools(): Record<string, Tool> {
  return {
    get_self: tool({
      description:
        'Renvoie l’utilisateur Tuleap connecté (id, username, real_name, email).',
      inputSchema: z.object({}),
      async execute(): Promise<unknown> {
        audit('chat.tool', 'get_self')
        const client = await buildTuleapClient()
        const me = await client.getSelf()
        return { id: me.id, username: me.username, real_name: me.real_name, email: me.email }
      }
    }),

    list_trackers: tool({
      description: 'Liste les trackers du projet courant (ou d’un projet précis).',
      inputSchema: z.object({
        projectId: z.number().int().positive().optional()
      }),
      async execute(input): Promise<unknown> {
        const args = input as { projectId?: number }
        audit('chat.tool', 'list_trackers', args)
        const id = args.projectId ?? projectIdOrThrow()
        const client = await buildTuleapClient()
        const page = await client.listTrackers(id, { limit: 50 })
        return page.items.map((t) => mapTracker(t, null))
      }
    }),

    list_artifacts: tool({
      description:
        'Liste les artéfacts d’un tracker. Renvoie au plus 25 items pour limiter le contexte.',
      inputSchema: z.object({
        trackerId: z.number().int().positive(),
        limit: z.number().int().min(1).max(50).optional(),
        offset: z.number().int().min(0).optional()
      }),
      async execute(input): Promise<unknown> {
        const args = input as { trackerId: number; limit?: number; offset?: number }
        audit('chat.tool', 'list_artifacts', args)
        const client = await buildTuleapClient()
        const page = await client.listArtifacts(args.trackerId, {
          limit: args.limit ?? 25,
          offset: args.offset ?? 0
        })
        return {
          items: page.items.map(mapArtifactSummary),
          total: page.total,
          offset: page.offset,
          limit: page.limit
        }
      }
    }),

    get_artifact: tool({
      description:
        'Récupère le détail d’un artéfact (titre, description, statut, valeurs, liens parents/enfants).',
      inputSchema: z.object({
        id: z.number().int().positive()
      }),
      async execute(input): Promise<unknown> {
        const args = input as { id: number }
        audit('chat.tool', 'get_artifact', args)
        const client = await buildTuleapClient()
        const raw = await client.getArtifact(args.id)
        return mapArtifactDetail(raw)
      }
    }),

    list_milestones: tool({
      description: 'Liste les milestones (sprints) du projet courant. Status par défaut : open.',
      inputSchema: z.object({
        projectId: z.number().int().positive().optional(),
        status: z.enum(['open', 'closed', 'all']).optional()
      }),
      async execute(input): Promise<unknown> {
        const args = input as { projectId?: number; status?: 'open' | 'closed' | 'all' }
        audit('chat.tool', 'list_milestones', args)
        const id = args.projectId ?? projectIdOrThrow()
        const client = await buildTuleapClient()
        const page = await client.listMilestones(id, {
          status: args.status ?? 'open',
          limit: 50
        })
        return page.items.map(mapMilestone)
      }
    }),

    find_artifacts_by_assignee: tool({
      description:
        "Trouve les artefacts d'un tracker assignes a une personne (filtre par nom en memoire). " +
        'Analyse les champs "Assigne a" / "Assigned to" / "Responsable". ' +
        'Limite aux 200 premiers artefacts du tracker.',
      inputSchema: z.object({
        trackerId: z.number().int().positive(),
        assigneeName: z
          .string()
          .describe('Nom complet ou partiel de la personne (ex: "Alexandre Lebegue", "alex")'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Nombre max de résultats à retourner (défaut: 25)')
      }),
      async execute(input): Promise<unknown> {
        const args = input as { trackerId: number; assigneeName: string; limit?: number }
        audit('chat.tool', 'find_artifacts_by_assignee', args)
        const client = await buildTuleapClient()
        const needle = args.assigneeName.toLowerCase().trim()
        const maxResults = args.limit ?? 25
        const FETCH_LIMIT = 200

        const page = await client.listArtifacts(args.trackerId, {
          limit: FETCH_LIMIT,
          offset: 0,
          values: 'all'
        })

        const matched = page.items.filter((raw) => matchesAssignee(raw, needle))
        const sliced = matched.slice(0, maxResults)

        return {
          items: sliced.map(mapArtifactSummary),
          matched: matched.length,
          fetched: page.items.length,
          total: page.total,
          ...(page.total > FETCH_LIMIT
            ? { note: `Seuls ${FETCH_LIMIT}/${page.total} artéfacts analysés — résultats partiels.` }
            : {})
        }
      }
    })
  }
}
