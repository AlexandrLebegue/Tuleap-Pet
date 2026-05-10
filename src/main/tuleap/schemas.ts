import { z } from 'zod'

/**
 * Schémas Zod défensifs pour les réponses Tuleap.
 *
 * Tuleap renvoie de nombreux champs supplémentaires selon la version /
 * la configuration de l'instance, on autorise les inconnus et on ne typifie
 * que ce dont on a besoin pour Phase 0.
 */

export const userSelfSchema = z
  .object({
    id: z.number(),
    uri: z.string(),
    username: z.string(),
    real_name: z.string().optional().default(''),
    email: z.string().optional().default('')
  })
  .passthrough()

export type UserSelf = z.infer<typeof userSelfSchema>

export const projectSchema = z
  .object({
    id: z.number(),
    uri: z.string(),
    label: z.string(),
    shortname: z.string()
  })
  .passthrough()

export type ProjectRaw = z.infer<typeof projectSchema>

export const trackerSchema = z
  .object({
    id: z.number(),
    uri: z.string(),
    label: z.string(),
    item_name: z.string().optional().default(''),
    description: z.string().optional().default(''),
    color_name: z.string().nullable().optional()
  })
  .passthrough()

export type TrackerRaw = z.infer<typeof trackerSchema>

export const artifactLinkSchema = z
  .object({
    id: z.number(),
    uri: z.string().optional().default(''),
    type: z.string().nullable().optional()
  })
  .passthrough()

export const artifactFieldValueSchema = z
  .object({
    field_id: z.number(),
    label: z.string().optional().default(''),
    type: z.string().optional().default('unknown')
  })
  .passthrough()

export type ArtifactFieldValueRaw = z.infer<typeof artifactFieldValueSchema>

const baseArtifactSchema = z
  .object({
    id: z.number(),
    uri: z.string(),
    title: z.string().nullable().optional().default(''),
    status: z.string().nullable().optional().default(null),
    submitted_by: z.number().nullable().optional(),
    submitted_by_user: z
      .object({ username: z.string().optional(), real_name: z.string().optional() })
      .passthrough()
      .optional(),
    submitted_on: z.string().nullable().optional(),
    last_modified_date: z.string().nullable().optional(),
    html_url: z.string().nullable().optional(),
    tracker: z.object({ id: z.number() }).passthrough()
  })
  .passthrough()

export const artifactSummarySchema = baseArtifactSchema

/**
 * Schema for items returned by /api/milestones/{id}/content.
 * These "backlog items" may lack `uri` and `tracker` at the top level
 * depending on the Tuleap version / configuration.
 */
export const milestoneContentItemSchema = z
  .object({
    id: z.number(),
    uri: z.string().optional().default(''),
    title: z.string().nullable().optional().default(''),
    label: z.string().nullable().optional(),
    status: z.string().nullable().optional().default(null),
    submitted_by: z.number().nullable().optional(),
    submitted_by_user: z
      .object({ username: z.string().optional(), real_name: z.string().optional() })
      .passthrough()
      .optional(),
    submitted_on: z.string().nullable().optional(),
    last_modified_date: z.string().nullable().optional(),
    html_url: z.string().nullable().optional(),
    tracker: z.object({ id: z.number() }).passthrough().optional(),
    artifact: z
      .object({
        id: z.number(),
        uri: z.string().optional().default(''),
        tracker: z.object({ id: z.number() }).passthrough().optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough()

export type MilestoneContentItemRaw = z.infer<typeof milestoneContentItemSchema>

export type ArtifactSummaryRaw = z.infer<typeof artifactSummarySchema>

export const artifactDetailSchema = baseArtifactSchema.extend({
  values: z.array(artifactFieldValueSchema).optional().default([]),
  values_by_field: z.record(z.string(), artifactFieldValueSchema).nullish()
})

export type ArtifactDetailRaw = z.infer<typeof artifactDetailSchema>

export const milestoneSchema = z
  .object({
    id: z.number(),
    uri: z.string(),
    label: z.string(),
    status: z.string().nullable().optional(),
    semantic_status: z.string().nullable().optional(),
    start_date: z.string().nullable().optional(),
    end_date: z.string().nullable().optional(),
    html_url: z.string().nullable().optional()
  })
  .passthrough()

export type MilestoneRaw = z.infer<typeof milestoneSchema>

export const arrayOf = <T extends z.ZodTypeAny>(schema: T): z.ZodArray<T> => z.array(schema)

// ---- Git repositories & branches ----

export const gitRepositorySchema = z
  .object({
    id: z.number(),
    name: z.string(),
    description: z.string().optional().default(''),
    // Tuleap versions differ on clone URL field names
    clone_http_url: z.string().optional().default(''),
    clone_ssh_url: z.string().optional().default(''),
    http_url: z.string().optional().default(''),
    path: z.string().optional().default(''),
    path_without_project: z.string().optional().default(''),
    clone_url: z
      .object({
        http: z.string().optional().default(''),
        ssh: z.string().optional().default('')
      })
      .passthrough()
      .optional()
  })
  .passthrough()

export type GitRepositoryRaw = z.infer<typeof gitRepositorySchema>

export const gitBranchSchema = z
  .object({
    name: z.string()
  })
  .passthrough()

export type GitBranchRaw = z.infer<typeof gitBranchSchema>

export const pullRequestCreatedSchema = z
  .object({
    id: z.number(),
    html_url: z.string().optional().default('')
  })
  .passthrough()

export type PullRequestCreatedRaw = z.infer<typeof pullRequestCreatedSchema>

// ---- Git commits ----

export const gitCommitSchema = z
  .object({
    id: z.string(),
    short_id: z.string().optional(),
    title: z.string().optional().default(''),
    author_name: z.string().optional().default(''),
    authored_date: z.string().optional().default('')
  })
  .passthrough()

export type GitCommitRaw = z.infer<typeof gitCommitSchema>

// ---- Tracker structure (for Kanban field/semantics discovery) ----

export const trackerFieldBindValueSchema = z
  .object({ id: z.number(), label: z.string() })
  .passthrough()

export const trackerFieldSchema = z
  .object({
    field_id: z.number(),
    label: z.string().optional().default(''),
    type: z.string().optional().default('unknown'),
    values: z.array(trackerFieldBindValueSchema).optional().default([])
  })
  .passthrough()

export const trackerStructureSchema = z
  .object({
    id: z.number(),
    fields: z.array(trackerFieldSchema).optional().default([]),
    semantics: z
      .object({
        title: z.object({ field_id: z.number() }).passthrough().optional(),
        description: z.object({ field_id: z.number() }).passthrough().optional(),
        status: z.object({ field_id: z.number() }).passthrough().optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough()

export type TrackerStructureRaw = z.infer<typeof trackerStructureSchema>
