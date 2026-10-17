import { connectionNoteInputSchema } from '#shared/schemas/notes'
import { parseBody, run } from '../../../connections/http'
import { connectionNoteKey, saveNote } from '../../../notes/notes'
import { useStore } from '../../../store/db'

/** Replaces the Markdown note of the connection; blank content removes it. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = parseBody(connectionNoteInputSchema, await readBody(event))
  return run(async () => saveNote(useStore(), connectionNoteKey(id), body.content))
})
