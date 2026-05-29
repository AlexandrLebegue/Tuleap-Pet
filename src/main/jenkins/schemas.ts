import { z } from 'zod'

export const jenkinsRootSchema = z
  .object({
    nodeName: z.string().optional().default(''),
    version: z.string().optional().default('')
  })
  .passthrough()

export type JenkinsRootRaw = z.infer<typeof jenkinsRootSchema>

export const jenkinsBuildSchema = z
  .object({
    number: z.number(),
    url: z.string(),
    result: z.string().nullable().optional(),
    duration: z.number().optional().default(0),
    timestamp: z.number(),
    displayName: z.string().optional(),
    building: z.boolean().optional().default(false),
    description: z.string().nullable().optional(),
    fullDisplayName: z.string().optional(),
    queueId: z.number().nullable().optional(),
    estimatedDuration: z.number().optional().default(0),
    actions: z.array(z.unknown()).optional().default([])
  })
  .passthrough()

export type JenkinsBuildRaw = z.infer<typeof jenkinsBuildSchema>

export const jenkinsJobSchema = z
  .object({
    name: z.string(),
    displayName: z.string().optional(),
    url: z.string(),
    color: z.string().optional().default('grey'),
    _class: z.string().optional().default(''),
    lastBuild: z
      .object({
        number: z.number(),
        result: z.string().nullable().optional(),
        timestamp: z.number().optional()
      })
      .passthrough()
      .nullable()
      .optional()
  })
  .passthrough()

export type JenkinsJobRaw = z.infer<typeof jenkinsJobSchema>

export const jenkinsJobListSchema = z
  .object({
    jobs: z.array(jenkinsJobSchema).optional().default([])
  })
  .passthrough()

export const jenkinsBranchBuildSchema = z
  .object({
    number: z.number(),
    result: z.string().nullable().optional(),
    timestamp: z.number(),
    building: z.boolean().optional().default(false),
    url: z.string()
  })
  .passthrough()

export const jenkinsQueueItemSchema = z
  .object({
    id: z.number(),
    why: z.string().nullable().optional(),
    inQueueSince: z.number(),
    task: z.object({ name: z.string(), url: z.string() }).passthrough(),
    blocked: z.boolean().optional().default(false),
    buildable: z.boolean().optional().default(false),
    stuck: z.boolean().optional().default(false)
  })
  .passthrough()

export const jenkinsQueueSchema = z
  .object({
    items: z.array(jenkinsQueueItemSchema).optional().default([])
  })
  .passthrough()

export const jenkinsNodeSchema = z
  .object({
    displayName: z.string(),
    description: z.string().nullable().optional(),
    offline: z.boolean(),
    temporarilyOffline: z.boolean().optional().default(false),
    offlineCauseReason: z.string().nullable().optional(),
    numExecutors: z.number().optional().default(1),
    idle: z.boolean().optional().default(true),
    monitorData: z.record(z.unknown()).optional().default({})
  })
  .passthrough()

export const jenkinsComputerSchema = z
  .object({
    computer: z.array(jenkinsNodeSchema).optional().default([])
  })
  .passthrough()
