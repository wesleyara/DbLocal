import { erdNotesInputSchema } from '#shared/schemas/erd'
import { parseBody, run } from '../../../connections/http'
import { saveErdNotes } from '../../../erd/notes'
import { useStore } from '../../../store/db'

/** Replaces the comments of the ERD of a schema. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = parseBody(erdNotesInputSchema, await readBody(event))
  return run(async () => ({ notes: await saveErdNotes(useStore(), id, body.schema, body.notes) }))
})
