import { z } from 'zod'
import { ERD_NOTE_MAX_LENGTH, ERD_NOTE_MAX_WIDTH, ERD_NOTE_MIN_WIDTH } from '../erd'

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

export const erdNoteSchema = z.object({
  id: z.string().min(1).max(64),
  x: z.number().finite(),
  y: z.number().finite(),
  text: z.string().max(ERD_NOTE_MAX_LENGTH),
  width: z.number().min(ERD_NOTE_MIN_WIDTH).max(ERD_NOTE_MAX_WIDTH).optional(),
})

/** Body of `PUT /api/c/:id/erd-notes`: the whole list of notes of the schema. */
export const erdNotesInputSchema = z.object({
  schema: z.string().min(1),
  notes: z.array(erdNoteSchema).max(500),
})

export type ErdNotesInput = z.infer<typeof erdNotesInputSchema>
