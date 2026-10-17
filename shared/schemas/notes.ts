import { z } from 'zod'

/** Markdown notes are free text; the cap only keeps one note from bloating the store. */
export const NOTE_MAX_LENGTH = 200_000

/** A Markdown note of a connection or of a table. `updatedAt` is null while nothing was written. */
export interface Note {
  content: string
  updatedAt: string | null
}

/** Body of `PUT /api/c/:id/notes`: the whole Markdown of the connection's note. */
export const connectionNoteInputSchema = z.object({
  content: z.string().max(NOTE_MAX_LENGTH),
})

/** Body of `PUT /api/c/:id/tables/:table/notes`. */
export const tableNoteInputSchema = z.object({
  schema: z.string().min(1),
  content: z.string().max(NOTE_MAX_LENGTH),
})
