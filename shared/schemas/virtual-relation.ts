import { z } from 'zod'

export const cardinalitySchema = z.enum(['many-to-one', 'one-to-many', 'one-to-one', 'many-to-many'])

const columnList = z.array(z.string().min(1)).min(1).max(8)

/** Body of `POST /api/c/:id/virtual-relations` and `PATCH .../:relationId`. */
export const virtualRelationInputSchema = z
  .object({
    schema: z.string().min(1),
    name: z.string().trim().max(120).nullable().optional(),
    fromTable: z.string().min(1),
    fromColumns: columnList,
    toTable: z.string().min(1),
    toColumns: columnList,
    cardinality: cardinalitySchema,
  })
  .refine((v) => v.fromColumns.length === v.toColumns.length, {
    message: 'fromColumns and toColumns must have the same length',
    path: ['toColumns'],
  })

export const displayColumnSchema = z.object({
  schema: z.string().min(1),
  table: z.string().min(1),
  column: z.string().min(1).nullable(),
})

export type VirtualRelationInput = z.infer<typeof virtualRelationInputSchema>
export type DisplayColumnInput = z.infer<typeof displayColumnSchema>
