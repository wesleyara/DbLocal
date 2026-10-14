import type { CountResponse } from '#shared/types/rows'
import { countRequestSchema } from '#shared/schemas/rows'
import { run, parseBody } from '../../../../../connections/http'
import { countRowsView } from '../../../../../query/rows-service'
import { useStore } from '../../../../../store/db'

/** Row count of a table under a filter. `exact: false` may return the catalogue estimate for large tables. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const table = getRouterParam(event, 'table')!
  const body = parseBody(countRequestSchema, await readBody(event))
  return run(async (): Promise<CountResponse> => countRowsView(useStore(), id, table, body))
})
