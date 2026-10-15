import type { ErdLayout } from '#shared/schemas/erd'
import { run } from '../../../connections/http'
import { getErdLayout } from '../../../erd/layout'
import { useStore } from '../../../store/db'

/** Saved node positions of the ERD (`?schema=`). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const schema = String(getQuery(event).schema ?? '')
  return run(async (): Promise<ErdLayout> => getErdLayout(useStore(), id, schema))
})
