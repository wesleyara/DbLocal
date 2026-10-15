import { tableExportRequestSchema } from '#shared/schemas/rows'
import { parseBody, run } from '../../../../../connections/http'
import { streamTableExport } from '../../../../../query/export-service'
import { useStore } from '../../../../../store/db'
import { sendExport } from '../../../../../utils/export-stream'

/** Streams a table as CSV or JSON, with the grid's filter, sort and relation scope. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const table = getRouterParam(event, 'table')!
  const body = parseBody(tableExportRequestSchema, await readBody(event))
  return run(() =>
    sendExport(event, `${table}.${body.format}`, body.format, (sink) =>
      streamTableExport(useStore(), id, table, { ...body, filter: body.filter ?? null, sort: body.sort ?? [] }, sink),
    ),
  )
})
