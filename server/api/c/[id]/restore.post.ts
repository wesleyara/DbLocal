import type { RestoreEvent } from '#shared/types/backup'
import { planRestore, runRestore } from '../../../backup/restore-service'
import { run } from '../../../connections/http'
import { useStore } from '../../../store/db'

/**
 * Restores a `.sql` file sent as the raw body (`?schema=`, `?confirm=1` always required). The checks fail
 * as a normal error response; then the answer is NDJSON, one `RestoreEvent` per line. Closing the
 * request stops it after the statement that is running.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const query = getQuery(event)
  const sql = (await readRawBody(event, 'utf8')) ?? ''
  const db = useStore()
  const plan = await run(() =>
    planRestore(db, id, sql, { schema: typeof query.schema === 'string' ? query.schema : undefined, confirm: query.confirm === '1' }),
  )

  const controller = new AbortController()
  const res = event.node.res
  res.on('close', () => controller.abort())
  setHeader(event, 'Content-Type', 'application/x-ndjson; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-store')
  res.flushHeaders()
  const write = (e: RestoreEvent) => {
    if (!res.writableEnded) res.write(`${JSON.stringify(e)}\n`)
  }
  try {
    await runRestore(db, id, plan, write, controller.signal)
  } catch (err) {
    write({ type: 'error', index: -1, sql: '', message: err instanceof Error ? err.message : String(err) })
    write({ type: 'done', executed: 0, total: plan.statements.length, durationMs: 0, failed: true })
  }
  if (!res.writableEnded) res.end()
})
