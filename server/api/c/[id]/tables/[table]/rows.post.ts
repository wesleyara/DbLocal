import type { RowsResponse } from '#shared/types/rows'
import { rowsRequestSchema } from '#shared/schemas/rows'
import { run, parseBody } from '../../../../../connections/http'
import { readRowsPage } from '../../../../../query/rows-service'
import { useStore } from '../../../../../store/db'

/** One page of rows of a table. Filter, sort and paging are validated against the live schema. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const table = getRouterParam(event, 'table')!
  const body = parseBody(rowsRequestSchema, await readBody(event))
  return run(async (): Promise<RowsResponse> => readRowsPage(useStore(), id, table, body))
})
