import { z } from 'zod'
import { MAX_MUTATION_OPS, type MutationOp } from '../types/mutations'

const name = z.string().min(1).max(256)
const key = z
  .record(name, z.union([z.string(), z.number()]))
  .refine((k) => Object.keys(k).length > 0 && Object.keys(k).length <= 16, { message: 'invalid key' })
const values = z.record(name, z.unknown()).refine((v) => Object.keys(v).length <= 1000, { message: 'too many columns' })

const op: z.ZodType<MutationOp> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('insert'), table: name, values }),
  z.object({ type: z.literal('update'), table: name, pk: key, values }),
  z.object({ type: z.literal('delete'), table: name, pk: key }),
  z.object({ type: z.literal('upsert'), table: name, values }),
]) as z.ZodType<MutationOp>

/** Body of `POST /api/c/:id/mutations`. */
export const mutationRequestSchema = z.object({
  schema: z.string().min(1),
  ops: z.array(op).min(1).max(MAX_MUTATION_OPS),
  dryRun: z.boolean().optional(),
})
