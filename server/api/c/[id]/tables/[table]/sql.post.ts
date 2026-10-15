import { rowsRequestSchema } from '#shared/schemas/rows'
import { parseBody, run } from '../../../../../connections/http'
import { previewRowsSql } from '../../../../../query/rows-service'
import { useStore } from '../../../../../store/db'

/** The SELECT behind a grid view (filter, sort, scope, columns, page), parameters inlined. Not executed. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const table = getRouterParam(event, 'table')!
  const body = parseBody(rowsRequestSchema, await readBody(event))
  return run(() => previewRowsSql(useStore(), id, table, body))
})
