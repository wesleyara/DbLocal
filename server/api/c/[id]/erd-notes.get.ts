import type { ErdNote } from '#shared/erd'
import { run } from '../../../connections/http'
import { getErdNotes } from '../../../erd/notes'
import { useStore } from '../../../store/db'

/** Comments placed on the ERD (`?schema=`). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const schema = String(getQuery(event).schema ?? '')
  return run(async (): Promise<{ notes: ErdNote[] }> => ({ notes: await getErdNotes(useStore(), id, schema) }))
})
