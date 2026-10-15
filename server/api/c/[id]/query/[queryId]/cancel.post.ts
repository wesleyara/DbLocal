import type { QueryCancelResponse } from '#shared/types/query'
import { run } from '../../../../../connections/http'
import { cancelQuery } from '../../../../../query/raw-query-service'

/** Aborts the statement a running query is executing on the server. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const queryId = getRouterParam(event, 'queryId')!
  return run(async (): Promise<QueryCancelResponse> => ({ cancelled: await cancelQuery(id, queryId) }))
})
