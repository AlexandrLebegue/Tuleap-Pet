import { z } from 'zod'
import { tool, type Tool } from 'ai'
import { buildTuleapClient, TuleapError } from '../tuleap'
import { audit } from '../store/db'
import { getConfig } from '../store/config'

/**
 * Write tools for the Tuleap chatbot. To keep risky operations safe, these
 * tools NEVER hit Tuleap directly — they return a "preview" payload describing
 * the intended action. The renderer surfaces a confirmation modal; the user
 * then calls `tuleap:apply-write` (see ipc/tuleap-write.ts) to actually
 * perform the action.
 */
export function buildTuleapWriteTools(): Record<string, Tool> {
  return {
    propose_add_comment: tool({
      description:
        "Propose d'ajouter un commentaire à un artéfact Tuleap. Renvoie un aperçu — l'utilisateur valide manuellement avant l'écriture.",
      inputSchema: z.object({
        artifactId: z.number().int().positive(),
        comment: z.string().min(1)
      }),
      async execute(input): Promise<unknown> {
        const args = input as { artifactId: number; comment: string }
        audit('chat.tool.propose', 'add_comment', args)
        return {
          kind: 'pending-write',
          action: 'add_comment',
          artifactId: args.artifactId,
          comment: args.comment,
          summary: `Ajouter un commentaire sur #${args.artifactId} (${args.comment.length} caractères).`
        }
      }
    }),

    propose_transition_status: tool({
      description:
        "Propose de changer le statut d'un artéfact. Le statut doit exister dans le tracker (To do, In progress, Done, etc.).",
      inputSchema: z.object({
        artifactId: z.number().int().positive(),
        newStatus: z.string().min(1)
      }),
      async execute(input): Promise<unknown> {
        const args = input as { artifactId: number; newStatus: string }
        audit('chat.tool.propose', 'transition_status', args)
        return {
          kind: 'pending-write',
          action: 'transition_status',
          artifactId: args.artifactId,
          newStatus: args.newStatus,
          summary: `Passer l'artéfact #${args.artifactId} au statut "${args.newStatus}".`
        }
      }
    }),

    propose_create_artifact: tool({
      description:
        "Propose de créer un nouvel artéfact dans un tracker. L'utilisateur valide les champs avant POST.",
      inputSchema: z.object({
        trackerId: z.number().int().positive(),
        title: z.string().min(1),
        description: z.string().optional()
      }),
      async execute(input): Promise<unknown> {
        const args = input as { trackerId: number; title: string; description?: string }
        audit('chat.tool.propose', 'create_artifact', args)
        return {
          kind: 'pending-write',
          action: 'create_artifact',
          trackerId: args.trackerId,
          title: args.title,
          description: args.description ?? null,
          summary: `Créer "${args.title}" dans le tracker ${args.trackerId}.`
        }
      }
    }),

    propose_move_to_sprint: tool({
      description:
        "Propose de déplacer un ou plusieurs artéfacts dans un sprint (milestone). Si milestoneId est null, retire du sprint courant.",
      inputSchema: z.object({
        artifactIds: z.array(z.number().int().positive()).min(1),
        milestoneId: z.number().int().positive().nullable()
      }),
      async execute(input): Promise<unknown> {
        const args = input as { artifactIds: number[]; milestoneId: number | null }
        audit('chat.tool.propose', 'move_to_sprint', args)
        return {
          kind: 'pending-write',
          action: 'move_to_sprint',
          artifactIds: args.artifactIds,
          milestoneId: args.milestoneId,
          summary:
            args.milestoneId === null
              ? `Retirer ${args.artifactIds.length} artéfact(s) de leur sprint.`
              : `Déplacer ${args.artifactIds.length} artéfact(s) vers le sprint ${args.milestoneId}.`
        }
      }
    }),

    propose_link_artifacts: tool({
      description:
        "Propose de créer un lien parent → enfants entre artéfacts. Utile pour rattacher des tâches à une story.",
      inputSchema: z.object({
        parentId: z.number().int().positive(),
        childIds: z.array(z.number().int().positive()).min(1)
      }),
      async execute(input): Promise<unknown> {
        const args = input as { parentId: number; childIds: number[] }
        audit('chat.tool.propose', 'link_artifacts', args)
        return {
          kind: 'pending-write',
          action: 'link_artifacts',
          parentId: args.parentId,
          childIds: args.childIds,
          summary: `Lier #${args.parentId} → [${args.childIds.map((id) => `#${id}`).join(', ')}].`
        }
      }
    })
  }
}

export type PendingWriteAction =
  | {
      kind: 'add_comment'
      artifactId: number
      comment: string
      format?: 'text' | 'html'
    }
  | {
      kind: 'transition_status'
      artifactId: number
      newStatus: string
    }
  | {
      kind: 'create_artifact'
      trackerId: number
      title: string
      description: string | null
    }
  | {
      kind: 'move_to_sprint'
      artifactIds: number[]
      milestoneId: number | null
      fromMilestoneId?: number | null
    }
  | {
      kind: 'link_artifacts'
      parentId: number
      childIds: number[]
    }

/**
 * Apply a previously proposed write. Returns a summary of what was done.
 */
export async function applyWrite(action: PendingWriteAction): Promise<{ ok: true; message: string }> {
  const client = await buildTuleapClient()
  switch (action.kind) {
    case 'add_comment': {
      await client.addArtifactComment({
        artifactId: action.artifactId,
        body: action.comment,
        format: action.format ?? 'text'
      })
      audit('tuleap.write', 'add_comment', { artifactId: action.artifactId })
      return { ok: true, message: `Commentaire ajouté sur #${action.artifactId}.` }
    }
    case 'transition_status': {
      const artifact = await client.getArtifact(action.artifactId)
      const trackerStructure = await client.getTrackerFields(artifact.tracker.id)
      const fields = trackerStructure.fields ?? []
      const statusField = fields.find(
        (f: unknown) => {
          const obj = f as { type?: string; name?: string; label?: string }
          return (obj.type === 'sb' || obj.type === 'msb') && /status|statut|state/i.test(obj.label ?? '')
        }
      ) as { field_id?: number; values?: Array<{ id: number; label: string }> } | undefined
      if (!statusField?.field_id || !statusField.values) {
        throw new TuleapError('unknown', 'Champ status introuvable sur le tracker.')
      }
      const match = statusField.values.find(
        (v) => v.label.toLowerCase() === action.newStatus.toLowerCase()
      )
      if (!match) {
        throw new TuleapError(
          'unknown',
          `Statut "${action.newStatus}" inconnu (valeurs: ${statusField.values.map((v) => v.label).join(', ')}).`
        )
      }
      await client.updateArtifactStatus({
        artifactId: action.artifactId,
        statusFieldId: statusField.field_id,
        statusBindValueId: match.id
      })
      audit('tuleap.write', 'transition_status', { artifactId: action.artifactId, newStatus: action.newStatus })
      return { ok: true, message: `#${action.artifactId} → "${match.label}".` }
    }
    case 'create_artifact': {
      const trackerStructure = await client.getTrackerFields(action.trackerId)
      const fields = (trackerStructure.fields ?? []) as Array<{
        field_id: number
        name?: string
        label?: string
        type?: string
        values?: Array<{ id: number; label: string }>
      }>
      const titleField = fields.find((f) => f.type === 'string' && /title|titre|name|summary/i.test(f.label ?? ''))
      const descField = fields.find((f) => f.type === 'text' && /desc|details/i.test(f.label ?? ''))
      if (!titleField) throw new TuleapError('unknown', 'Champ titre introuvable.')
      const created = await client.createArtifact({
        trackerId: action.trackerId,
        titleFieldId: titleField.field_id,
        title: action.title,
        statusFieldId: null,
        statusBindValueId: null,
        descriptionFieldId: descField?.field_id ?? null,
        description: action.description
      })
      audit('tuleap.write', 'create_artifact', { id: created.id, trackerId: action.trackerId })
      return { ok: true, message: `Artéfact #${created.id} créé.` }
    }
    case 'move_to_sprint': {
      if (action.milestoneId === null) {
        if (typeof action.fromMilestoneId !== 'number') {
          throw new TuleapError('unknown', 'fromMilestoneId requis pour retirer du sprint.')
        }
        await client.removeArtifactsFromMilestone({
          milestoneId: action.fromMilestoneId,
          artifactIds: action.artifactIds
        })
        audit('tuleap.write', 'remove_from_milestone', { milestoneId: action.fromMilestoneId, ids: action.artifactIds })
        return { ok: true, message: `${action.artifactIds.length} artéfact(s) retiré(s) du sprint.` }
      }
      await client.addArtifactsToMilestone({
        milestoneId: action.milestoneId,
        artifactIds: action.artifactIds
      })
      audit('tuleap.write', 'add_to_milestone', { milestoneId: action.milestoneId, ids: action.artifactIds })
      return { ok: true, message: `${action.artifactIds.length} artéfact(s) ajouté(s) au sprint.` }
    }
    case 'link_artifacts': {
      const parent = await client.getArtifact(action.parentId)
      const trackerStructure = await client.getTrackerFields(parent.tracker.id)
      const fields = (trackerStructure.fields ?? []) as Array<{
        field_id: number
        type?: string
      }>
      const linkField = fields.find((f) => f.type === 'art_link')
      if (!linkField) throw new TuleapError('unknown', 'Champ artifact-link introuvable.')
      await client.linkArtifacts({
        artifactId: action.parentId,
        linkFieldId: linkField.field_id,
        childIds: action.childIds,
        nature: '_is_child'
      })
      audit('tuleap.write', 'link_artifacts', { parentId: action.parentId, childIds: action.childIds })
      return { ok: true, message: `Lien créé : #${action.parentId} → ${action.childIds.length} enfant(s).` }
    }
  }
}

void getConfig
