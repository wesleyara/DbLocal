import type { Kysely } from 'kysely'
import { classifyStatement, splitStatements, type SqlStatement } from '#shared/sql-split'
import type { RestoreEvent } from '#shared/types/backup'
import { getConnection } from '../connections/repository'
import { DriverError } from '../drivers/errors'
import { ConfirmationRequiredError, QueryInputError } from '../query/errors'
import { connectionDriver, defaultSchemaOf, invalidateSchema } from '../schema/service'
import type { StoreSchema } from '../store/db'
import { globalReadonly } from '../utils/readonly'

type Db = Kysely<StoreSchema>

/** Largest script a restore accepts (the SQL editor stops at 1 MB). */
export const MAX_RESTORE_BYTES = 200 * 1024 * 1024

export interface RestorePlan {
  statements: SqlStatement[]
  schema: string | undefined
}

/**
 * Checks a restore before anything runs: the script is not empty and not too big, the connection
 * is not read-only (403), and a `prod` connection needs `confirm` (409, like the SQL editor).
 */
export async function planRestore(db: Db, connectionId: string, sql: string, req: { schema?: string; confirm: boolean }): Promise<RestorePlan> {
  const connection = await getConnection(db, connectionId)
  if (connection.readonly || globalReadonly()) {
    throw new DriverError('permission', 'This connection is read-only: a restore cannot run')
  }
  if (Buffer.byteLength(sql) > MAX_RESTORE_BYTES) throw new QueryInputError(400, 'The file is larger than 200 MB')
  const statements = splitStatements(sql, connection.dialect)
  if (statements.length === 0) throw new QueryInputError(400, 'The file has no SQL statements')
  if (connection.environment === 'prod' && !req.confirm) {
    throw new ConfirmationRequiredError([...new Set(statements.map((s) => classifyStatement(s.sql, connection.dialect)))])
  }
  const schema = req.schema || defaultSchemaOf(connection.dialect, connection.defaultSchema, connection.database) || undefined
  return { statements, schema }
}

/**
 * Runs a planned restore statement by statement on one session (so `SET` and `PRAGMA` carry
 * over), reporting progress. The first failing statement stops it; what ran before stays. The
 * schema cache is dropped at the end whatever happened. Statements are not added to the history.
 */
export async function runRestore(
  db: Db,
  connectionId: string,
  plan: RestorePlan,
  emit: (e: RestoreEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const total = plan.statements.length
  const started = performance.now()
  emit({ type: 'start', total })
  const driver = await connectionDriver(db, connectionId)
  const session = await driver.openQuerySession({ schema: plan.schema, readonly: false })
  let executed = 0
  let failed = false
  let lastReport = 0
  try {
    for (const [index, statement] of plan.statements.entries()) {
      if (signal.aborted) break
      try {
        await session.run(statement.sql, 1)
      } catch (err) {
        failed = true
        emit({ type: 'error', index, sql: statement.sql.slice(0, 2000), message: err instanceof Error ? err.message : String(err) })
        break
      }
      executed++
      if (performance.now() - lastReport > 250 || executed === total) {
        lastReport = performance.now()
        emit({ type: 'progress', done: executed, total })
      }
    }
  } finally {
    await session.close({ discard: true }).catch(() => {})
    invalidateSchema(connectionId)
  }
  emit({ type: 'done', executed, total, durationMs: Math.round(performance.now() - started), failed: failed || signal.aborted })
}
