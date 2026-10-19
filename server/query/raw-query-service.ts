import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { assessScript } from '#shared/sql-risk'
import { classifyStatement, splitStatements } from '#shared/sql-split'
import {
  DEFAULT_QUERY_LIMIT,
  DEFAULT_QUERY_TIMEOUT_MS,
  MAX_QUERY_STATEMENTS,
  type QueryColumn,
  type QueryRequest,
  type QueryResponse,
  type QueryStatus,
  type StatementKind,
  type StatementResult,
} from '#shared/types/query'
import { getConnection } from '../connections/repository'
import { DriverError, isDriverError } from '../drivers/errors'
import type { QuerySession, RawStatementOutput } from '../drivers/types'
import { connectionDriver, defaultSchemaOf, invalidateSchema } from '../schema/service'
import type { StoreSchema } from '../store/db'
import { globalReadonly } from '../utils/readonly'
import { ConfirmationRequiredError, QueryInputError } from './errors'
import { getHistoryRetention, pruneHistory } from './saved-queries-service'
import { serializeValue } from './serialize'

type Db = Kysely<StoreSchema>

interface RunningQuery {
  connectionId: string
  session: QuerySession
  cancelled: boolean
  timedOut: boolean
}

/** Queries that are executing now, by id, so a cancel request can find them. */
const running = new Map<string, RunningQuery>()

/** Column names made unique (`id`, `id_2`, ...) so a row object can hold every column of a join. */
export function uniqueColumnNames(names: string[]): string[] {
  const seen = new Map<string, number>()
  const used = new Set(names)
  return names.map((name) => {
    const count = (seen.get(name) ?? 0) + 1
    seen.set(name, count)
    if (count === 1) return name
    let candidate = `${name}_${count}`
    while (used.has(candidate)) candidate += '_'
    used.add(candidate)
    return candidate
  })
}

/** Turns the driver's array rows into serialisable objects keyed by unique column names. */
export function shapeOutput(out: RawStatementOutput): { columns: QueryColumn[]; rows: Record<string, unknown>[] } {
  const names = uniqueColumnNames(out.columns.map((c) => c.name))
  const columns = out.columns.map((c, i) => ({ name: names[i]!, type: c.type }))
  const rows = out.rows.map((row) => {
    const obj: Record<string, unknown> = {}
    names.forEach((name, i) => {
      obj[name] = serializeValue(row[i])
    })
    return obj
  })
  return { columns, rows }
}

const blank = (index: number, sql: string, kind: StatementKind): StatementResult => ({
  index,
  sql,
  kind,
  status: 'skipped',
  columns: [],
  rows: [],
  rowCount: 0,
  affectedRows: null,
  durationMs: 0,
  truncated: false,
  notices: [],
  error: null,
})

/**
 * Runs a script of raw SQL statement by statement on one dedicated connection.
 *
 * Refused before anything runs: writes on a read-only connection (403) and writes or DDL on a
 * `prod` connection without `confirmWrites` (409). A failing statement ends the batch (the rest
 * are `skipped`); each statement has its own timeout, and `cancelQuery` aborts the running one.
 * Every statement that ran is recorded in `query_history`, and DDL drops the cached schema.
 */
export async function runRawQuery(db: Db, connectionId: string, req: QueryRequest): Promise<QueryResponse> {
  const connection = await getConnection(db, connectionId)
  const dialect = connection.dialect

  const statements = splitStatements(req.sql, dialect)
  if (statements.length === 0) throw new QueryInputError(400, 'There is no SQL to run')
  if (statements.length > MAX_QUERY_STATEMENTS) {
    throw new QueryInputError(400, `A script can have at most ${MAX_QUERY_STATEMENTS} statements`)
  }
  const kinds = statements.map((s) => classifyStatement(s.sql, dialect))

  const readonly = connection.readonly || globalReadonly()
  if (readonly && kinds.some((k) => k !== 'read')) {
    throw new DriverError('permission', 'This connection is read-only: only read statements can run')
  }
  const changes = kinds.filter((k) => k === 'write' || k === 'ddl')
  if (connection.environment === 'prod' && changes.length > 0 && !req.confirmWrites) {
    throw new ConfirmationRequiredError(kinds)
  }
  // Destructive statements need the confirmation on every connection, not only on prod.
  const risks = assessScript(req.sql, dialect).filter((r) => r.level === 'danger')
  if (risks.length > 0 && !req.confirmWrites) throw new ConfirmationRequiredError(kinds, risks)

  const queryId = req.queryId ?? randomUUID()
  if (running.has(queryId)) throw new DriverError('constraint', 'A query with this id is already running')

  const limit = req.limit ?? DEFAULT_QUERY_LIMIT
  const timeoutMs = req.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS
  const schema = req.schema || defaultSchemaOf(dialect, connection.defaultSchema, connection.database)

  const driver = await connectionDriver(db, connectionId)
  const session = await driver.openQuerySession({ schema: schema || undefined, readonly })
  const entry: RunningQuery = { connectionId, session, cancelled: false, timedOut: false }
  running.set(queryId, entry)

  const results: StatementResult[] = statements.map((s, i) => blank(i, s.sql, kinds[i]!))
  const started = performance.now()
  try {
    for (let i = 0; i < statements.length; i++) {
      const result = results[i]!
      const t0 = performance.now()
      const timer = setTimeout(() => {
        entry.timedOut = true
        void session.cancel()
      }, timeoutMs)
      try {
        const out = await session.run(statements[i]!.sql, limit)
        // MySQL answers an interrupted SLEEP() with a normal row: what the user asked for still wins.
        if (entry.cancelled || entry.timedOut) throw new DriverError('timeout', 'Interrupted')
        const shaped = shapeOutput(out)
        Object.assign(result, {
          status: 'ok' satisfies QueryStatus,
          ...shaped,
          rowCount: shaped.rows.length,
          affectedRows: out.affectedRows,
          truncated: out.truncated,
          notices: out.notices,
        })
      } catch (err) {
        const status: QueryStatus = entry.cancelled ? 'cancelled' : entry.timedOut ? 'timeout' : 'error'
        const driverErr = isDriverError(err) ? err : new DriverError('unknown', err instanceof Error ? err.message : String(err), err)
        result.status = status
        result.error = {
          code: status === 'cancelled' ? 'cancelled' : status === 'timeout' ? 'timeout' : driverErr.code,
          message:
            status === 'cancelled'
              ? 'Query cancelled'
              : status === 'timeout'
                ? `Query exceeded the ${Math.round(timeoutMs / 1000)} s timeout`
                : driverErr.message,
        }
        break
      } finally {
        clearTimeout(timer)
        result.durationMs = Math.round(performance.now() - t0)
      }
    }
  } finally {
    running.delete(queryId)
    await session.close({ discard: kinds.includes('other') }).catch(() => {})
  }

  const schemaInvalidated = results.some((r) => r.kind === 'ddl' && r.status === 'ok')
  if (schemaInvalidated) invalidateSchema(connectionId)

  await recordHistory(db, connectionId, results)
  return { queryId, durationMs: Math.round(performance.now() - started), statements: results, schemaInvalidated }
}

/** Aborts the statement a query is running. False when the query is not running (finished or unknown). */
export async function cancelQuery(connectionId: string, queryId: string): Promise<boolean> {
  const entry = running.get(queryId)
  if (!entry || entry.connectionId !== connectionId) return false
  entry.cancelled = true
  await entry.session.cancel()
  return true
}

/** History must never fail a query: a store error is swallowed. */
async function recordHistory(db: Db, connectionId: string, results: StatementResult[]): Promise<void> {
  const rows = results
    .filter((r) => r.status !== 'skipped')
    .map((r) => ({
      connection_id: connectionId,
      sql: r.sql,
      duration_ms: r.durationMs,
      row_count: r.status === 'ok' ? (r.affectedRows ?? r.rowCount) : null,
      status: r.status,
      error: r.error?.message ?? null,
      executed_at: new Date().toISOString(),
    }))
  if (rows.length === 0) return
  try {
    await db.insertInto('query_history').values(rows).execute()
    await pruneHistory(db, await getHistoryRetention(db))
  } catch {
    // Ignored on purpose.
  }
}
