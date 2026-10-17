import { tableNoteInputSchema } from '#shared/schemas/notes'
import { parseBody, run } from '../../../../../connections/http'
import { saveNote, tableNoteKey } from '../../../../../notes/notes'
import { useStore } from '../../../../../store/db'

/** Replaces the Markdown note of a table; blank content removes it. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const table = getRouterParam(event, 'table')!
  const body = parseBody(tableNoteInputSchema, await readBody(event))
  return run(async () => saveNote(useStore(), tableNoteKey(id, body.schema, table), body.content))
})
