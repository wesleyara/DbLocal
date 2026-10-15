import type { QueryResponse } from '#shared/types/query'
import { queryRequestSchema } from '#shared/schemas/query'
import { run, parseBody } from '../../../connections/http'
import { runRawQuery } from '../../../query/raw-query-service'
import { useStore } from '../../../store/db'

/** Runs a script of raw SQL, one result set per statement. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = parseBody(queryRequestSchema, await readBody(event))
  return run(async (): Promise<QueryResponse> => runRawQuery(useStore(), id, body))
})
