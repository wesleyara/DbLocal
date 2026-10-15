import { z } from 'zod'
import { MAX_QUERY_LIMIT, MAX_QUERY_SQL_LENGTH, MAX_QUERY_TIMEOUT_MS } from '../types/query'

/** Body of `POST /api/c/:id/query`. */
export const queryRequestSchema = z.object({
  sql: z.string().min(1).max(MAX_QUERY_SQL_LENGTH),
  schema: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(MAX_QUERY_LIMIT).optional(),
  timeoutMs: z.number().int().min(100).max(MAX_QUERY_TIMEOUT_MS).optional(),
  queryId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
  confirmWrites: z.boolean().optional(),
})
