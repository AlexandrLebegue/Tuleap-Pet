import type { MilestoneStatus, MilestoneSummary } from '@shared/types'
import type { TuleapClient } from './client'
import { mapMilestone } from './mappers'

/** Profondeur max de descente dans les sous-milestones (release → sprint → …). */
const MAX_DEPTH = 3

/**
 * Liste les milestones d'un projet en descendant récursivement dans les
 * sous-milestones : sur certains plannings Tuleap les sprints sont imbriqués
 * dans des releases, et /projects/{id}/milestones ne renvoie que le niveau
 * racine. Le résultat est aplati en pré-ordre (parent suivi de ses enfants)
 * avec `depth`/`parentId` renseignés pour l'affichage hiérarchique.
 *
 * Le filtre de statut n'est appliqué par l'API qu'au niveau racine ; on le
 * ré-applique donc localement aux enfants. Un parent hors filtre mais dont un
 * enfant matche est conservé (sinon l'enfant serait orphelin dans la liste).
 */
export async function listMilestonesWithChildren(
  client: TuleapClient,
  projectId: number,
  status: MilestoneStatus
): Promise<MilestoneSummary[]> {
  const rootsRaw = await client.fetchAll((offset) =>
    // On demande "all" à l'API et on filtre localement : un sprint ouvert peut
    // être imbriqué dans une release close (et inversement).
    client.listMilestones(projectId, { status: 'all', limit: 50, offset })
  )

  const seen = new Set<number>()
  const out: MilestoneSummary[] = []

  const matchesFilter = (m: MilestoneSummary): boolean => {
    if (status === 'all') return true
    const s = m.semanticStatus ?? m.status
    // Statut inconnu : on garde (mieux vaut un sprint en trop qu'un manquant).
    if (s === null) return true
    return s === status
  }

  const visit = async (
    m: MilestoneSummary,
    depth: number,
    parentId: number | null
  ): Promise<MilestoneSummary[]> => {
    if (seen.has(m.id)) return []
    seen.add(m.id)
    const self: MilestoneSummary = { ...m, depth, parentId }

    let children: MilestoneSummary[] = []
    if (depth < MAX_DEPTH) {
      try {
        const rawChildren = await client.fetchAll((offset) =>
          client.listSubMilestones(m.id, { limit: 50, offset })
        )
        const flattened = await Promise.all(
          rawChildren.map((raw) => visit(mapMilestone(raw), depth + 1, m.id))
        )
        children = flattened.flat()
      } catch {
        // Endpoint absent ou inaccessible sur cette instance : pas d'enfants.
      }
    }

    const keepSelf = matchesFilter(self)
    if (!keepSelf && children.length === 0) return []
    return [self, ...children]
  }

  for (const raw of rootsRaw) {
    out.push(...(await visit(mapMilestone(raw), 0, null)))
  }
  return out
}
