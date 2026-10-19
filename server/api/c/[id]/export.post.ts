import { EXPORT_MIME } from '#shared/export-format'
import { exportRequestSchema } from '#shared/schemas/saved-queries'
import { parseBody, run } from '../../../connections/http'
import { streamQueryExport } from '../../../query/export-service'
import { useStore } from '../../../store/db'
import { sendExport } from '../../../utils/export-stream'

/** Streams the result of one read statement as CSV or JSON (the whole result, or up to `limit` rows). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = parseBody(exportRequestSchema, await readBody(event))
  return run(() =>
    sendExport(event, `query.${body.format}`, EXPORT_MIME[body.format], (sink) => streamQueryExport(useStore(), id, body, sink)),
  )
})
