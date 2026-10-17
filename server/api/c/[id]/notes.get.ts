import type { Note } from '#shared/schemas/notes'
import { run } from '../../../connections/http'
import { connectionNoteKey, getNote } from '../../../notes/notes'
import { useStore } from '../../../store/db'

/** Markdown note of the connection. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return run(async (): Promise<Note> => getNote(useStore(), connectionNoteKey(id)))
})
