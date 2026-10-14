import { z } from 'zod'
import { MAX_PAGE_SIZE, type FilterNode } from '#shared/types/rows'

const MAX_DEPTH = 4
const MAX_NODES = 100
const MAX_LIST = 500

const scalar = z.union([z.string(), z.number(), z.boolean()])
const filterValue = z.union([scalar, z.array(z.union([z.string(), z.number()])).max(MAX_LIST)])

const condition = z.object({
  type: z.literal('condition'),
  column: z.string().min(1),
  op: z.enum([
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'contains',
    'starts_with',
    'ends_with',
    'in',
    'not_in',
    'is_null',
    'is_not_null',
    'between',
    'is_true',
    'is_false',
  ]),
  value: filterValue.optional(),
})

/** Recursive filter AST. Depth and node count are capped so a request cannot build an unbounded query. */
const node: z.ZodType<FilterNode> = z.lazy(() =>
  z.union([
    condition,
    z.object({
      type: z.literal('group'),
      logic: z.enum(['and', 'or']),
      children: z.array(node).max(MAX_NODES),
    }),
  ]),
) as z.ZodType<FilterNode>

export const filterNodeSchema = node.superRefine((root, ctx) => {
  let count = 0
  const walk = (n: FilterNode, depth: number): void => {
    count++
    if (depth > MAX_DEPTH || count > MAX_NODES) {
      ctx.addIssue({ code: 'custom', message: 'filter is too deep or too large' })
      return
    }
    if (n.type === 'group') n.children.forEach((child) => walk(child, depth + 1))
  }
  walk(root, 1)
})

const sortItem = z.object({ column: z.string().min(1), direction: z.enum(['asc', 'desc']) })

/** Body of `POST /api/c/:id/tables/:table/rows`. */
export const rowsRequestSchema = z.object({
  schema: z.string().min(1),
  filter: filterNodeSchema.nullable(),
  sort: z.array(sortItem).max(8),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE),
  offset: z.number().int().min(0),
  columns: z.array(z.string().min(1)).min(1).max(500).optional(),
})

/** Body of `POST /api/c/:id/tables/:table/count`. */
export const countRequestSchema = z.object({
  schema: z.string().min(1),
  filter: filterNodeSchema.nullable(),
  exact: z.boolean(),
})

const MAX_WIDTH = 2000

const names = z.array(z.string().min(1)).max(500)

export const gridPrefsSchema = z.object({
  widths: z.record(z.string().min(1), z.number().int().min(40).max(MAX_WIDTH)),
  hidden: names,
  order: names.default([]),
  pinned: names.default([]),
})

/** Body of `POST /api/c/:id/tables/:table/blob`: one binary cell, found by the row's primary key. */
export const blobRequestSchema = z.object({
  schema: z.string().min(1),
  column: z.string().min(1),
  key: z.record(z.string().min(1), z.union([z.string(), z.number()])).refine((k) => Object.keys(k).length > 0, {
    message: 'key is required',
  }),
})

/** Body of `PUT /api/c/:id/tables/:table/prefs`. */
export const gridPrefsRequestSchema = z.object({ schema: z.string().min(1), prefs: gridPrefsSchema })
