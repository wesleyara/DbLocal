import { z } from 'zod'

const position = z.object({ x: z.number().finite(), y: z.number().finite() })

/** Body of `PUT /api/c/:id/erd-layout`: positions merged into the saved ones, or replacing them. */
export const erdLayoutInputSchema = z.object({
  schema: z.string().min(1),
  positions: z.record(z.string().min(1), position).refine((p) => Object.keys(p).length <= 5000, 'too many tables'),
  /** Replaces the saved layout instead of merging into it. */
  replace: z.boolean().optional(),
})

export type ErdLayoutInput = z.infer<typeof erdLayoutInputSchema>
export interface ErdLayout {
  positions: Record<string, { x: number; y: number }>
}
