import { erdLayoutInputSchema } from '#shared/schemas/erd'
import { parseBody, run } from '../../../connections/http'
import { saveErdLayout } from '../../../erd/layout'
import { useStore } from '../../../store/db'

/** Saves node positions of the ERD (merged into the saved ones unless `replace`). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = parseBody(erdLayoutInputSchema, await readBody(event))
  return run(() => saveErdLayout(useStore(), id, body.schema, body.positions, body.replace))
})
