import { explainRequestSchema } from '#shared/schemas/saved-queries'
import { parseBody, run } from '../../../connections/http'
import { explainQuery } from '../../../query/explain-service'
import { useStore } from '../../../store/db'

/** EXPLAIN of one statement, parsed into a plan tree. `analyze` runs a read for real timings. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = parseBody(explainRequestSchema, await readBody(event))
  return run(() => explainQuery(useStore(), id, body))
})
