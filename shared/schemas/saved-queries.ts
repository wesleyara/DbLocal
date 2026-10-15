import { z } from 'zod'

const name = z.string().trim().min(1).max(200)
const sql = z.string().min(1).max(1_000_000)
const folder = z.string().trim().max(100).nullable()

export const savedQueryInputSchema = z.object({
  name,
  sql,
  connectionId: z.string().min(1).nullable().optional(),
  folder: folder.optional(),
})

export const savedQueryPatchSchema = z.object({
  name: name.optional(),
  sql: sql.optional(),
  connectionId: z.string().min(1).nullable().optional(),
  folder: folder.optional(),
})

export const historyQuerySchema = z.object({
  q: z.string().max(500).optional(),
  connectionId: z.string().min(1).optional(),
  status: z.enum(['ok', 'error', 'cancelled', 'timeout']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export const exportRequestSchema = z.object({
  sql: z.string().min(1).max(1_000_000),
  schema: z.string().min(1).optional(),
  format: z.enum(['csv', 'json']),
  /** Rows to export; absent means all of them (streamed). */
  limit: z.number().int().min(1).optional(),
  timeoutMs: z.number().int().min(100).max(60 * 60_000).optional(),
})

export const explainRequestSchema = z.object({
  sql: z.string().min(1).max(1_000_000),
  schema: z.string().min(1).optional(),
  analyze: z.boolean().optional(),
})
