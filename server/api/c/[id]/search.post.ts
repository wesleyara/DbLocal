import { searchRequestSchema } from '#shared/schemas/search'
import type { SearchEvent } from '#shared/types/search'
import { parseBody, run } from '../../../connections/http'
import { readSchema } from '../../../schema/service'
import { searchData } from '../../../search/search-service'
import { useStore } from '../../../store/db'

/**
 * Global data search. The answer is NDJSON, one `SearchEvent` per line, sent as each table
 * finishes. Closing the request (the client aborts) stops the tables that have not started.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = parseBody(searchRequestSchema, await readBody(event))
  const db = useStore()
  // Unknown connection or schema fail here, as a normal error response, before the stream starts.
  await run(() => readSchema(db, id, body.schema))

  const controller = new AbortController()
  const res = event.node.res
  res.on('close', () => controller.abort())
  setHeader(event, 'Content-Type', 'application/x-ndjson; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-store')
  res.flushHeaders()

  const write = (e: SearchEvent) => {
    if (!res.writableEnded && !controller.signal.aborted) res.write(`${JSON.stringify(e)}\n`)
  }
  try {
    await searchData(db, id, body, write, controller.signal)
  } catch (err) {
    write({ type: 'error', table: '', message: err instanceof Error ? err.message : String(err) })
    write({ type: 'done', searched: 0, skipped: 0, cancelled: false })
  }
  if (!res.writableEnded) res.end()
})
