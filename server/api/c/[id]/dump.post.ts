import { dumpRequestSchema } from '#shared/schemas/backup'
import { streamDump } from '../../../backup/dump-service'
import { getConnection } from '../../../connections/repository'
import { parseBody, run } from '../../../connections/http'
import { useStore } from '../../../store/db'
import { sendExport } from '../../../utils/export-stream'

/** Streams a logical dump (`.sql`) of a schema: structure, data, or both. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = parseBody(dumpRequestSchema, await readBody(event))
  const db = useStore()
  return run(async () => {
    const connection = await getConnection(db, id)
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
    return sendExport(event, `${connection.name}-${body.schema ?? 'dump'}-${stamp}.sql`, 'application/sql; charset=utf-8', (sink) => streamDump(db, id, body, sink))
  })
})
