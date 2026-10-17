import type { Note } from '#shared/schemas/notes'
import { run } from '../../../../../connections/http'
import { getNote, tableNoteKey } from '../../../../../notes/notes'
import { useStore } from '../../../../../store/db'

/** Markdown note of a table (`?schema=`). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const table = getRouterParam(event, 'table')!
  const schema = String(getQuery(event).schema ?? '')
  return run(async (): Promise<Note> => getNote(useStore(), tableNoteKey(id, schema, table)))
})
