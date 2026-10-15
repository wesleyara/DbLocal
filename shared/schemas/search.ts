import { z } from 'zod'
import { MAX_SEARCH_LIMIT, MAX_SEARCH_TERM, type SearchRequest } from '../types/search'

export const searchRequestSchema: z.ZodType<SearchRequest> = z.object({
  schema: z.string().min(1),
  term: z.string().trim().min(1).max(MAX_SEARCH_TERM),
  mode: z.enum(['exact', 'contains']),
  tables: z.array(z.string().min(1)).max(2000).optional(),
  limitPerTable: z.number().int().min(1).max(MAX_SEARCH_LIMIT).optional(),
})
