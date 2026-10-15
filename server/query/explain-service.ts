import type { Kysely } from 'kysely'
import { parseMysqlJsonPlan, parseMysqlTextPlan, parsePostgresPlan, parseSqlitePlan } from '#shared/explain'
import { classifyStatement, splitStatements } from '#shared/sql-split'
import { DEFAULT_QUERY_TIMEOUT_MS } from '#shared/types/query'
import type { ExplainRequest, ExplainResponse, PlanNode } from '#shared/types/explain'
import { getConnection } from '../connections/repository'
import { DriverError } from '../drivers/errors'
import { connectionDriver, defaultSchemaOf } from '../schema/service'
import type { StoreSchema } from '../store/db'
import { QueryInputError } from './errors'

type Db = Kysely<StoreSchema>

/** Text of the plan cell: JSON arrives parsed (pg) or as a string (mysql2). */
function planCell(value: unknown): { json: unknown; text: string } {
  if (typeof value === 'string') {
    try {
      const json = JSON.parse(value)
      return { json, text: JSON.stringify(json, null, 2) }
    } catch {
      return { json: null, text: value }
    }
  }
  return { json: value, text: JSON.stringify(value, null, 2) }
}

/**
 * Explains one statement. Plain EXPLAIN never executes it; `analyze` does, so it is refused for
 * anything that is not a read (and on SQLite, which has no ANALYZE). The session is read-only
 * either way: an explain never needs to write.
 */
export async function explainQuery(db: Db, connectionId: string, req: ExplainRequest): Promise<ExplainResponse> {
  const connection = await getConnection(db, connectionId)
  const dialect = connection.dialect
  const statements = splitStatements(req.sql, dialect)
  if (statements.length !== 1) throw new QueryInputError(400, 'EXPLAIN works on exactly one statement')
  const statement = statements[0]!.sql
  if (req.analyze) {
    if (dialect === 'sqlite') throw new QueryInputError(400, 'SQLite has no EXPLAIN ANALYZE')
    if (classifyStatement(statement, dialect) !== 'read') {
      throw new QueryInputError(400, 'EXPLAIN ANALYZE runs the statement: only reads are allowed')
    }
  }

  const explainSql =
    dialect === 'postgres'
      ? `EXPLAIN (FORMAT JSON${req.analyze ? ', ANALYZE' : ''}) ${statement}`
      : dialect === 'mysql'
        ? req.analyze
          ? `EXPLAIN ANALYZE ${statement}`
          : `EXPLAIN FORMAT=JSON ${statement}`
        : `EXPLAIN QUERY PLAN ${statement}`

  const schema = req.schema || defaultSchemaOf(dialect, connection.defaultSchema, connection.database)
  const driver = await connectionDriver(db, connectionId)
  const session = await driver.openQuerySession({ schema: schema || undefined, readonly: true })
  const started = performance.now()
  const timer = setTimeout(() => void session.cancel(), DEFAULT_QUERY_TIMEOUT_MS)
  let out
  try {
    out = await session.run(explainSql, 1000)
  } catch (err) {
    if (err instanceof DriverError) throw err
    throw new DriverError('unknown', err instanceof Error ? err.message : String(err), err)
  } finally {
    clearTimeout(timer)
    await session.close().catch(() => {})
  }

  let plan: PlanNode | null
  let raw: string
  if (dialect === 'postgres') {
    const cell = planCell(out.rows[0]?.[0])
    raw = cell.text
    plan = parsePostgresPlan(cell.json)
  } else if (dialect === 'mysql') {
    if (req.analyze) {
      raw = String(out.rows.map((r) => r[0]).join('\n'))
      plan = parseMysqlTextPlan(raw)
    } else {
      const cell = planCell(out.rows[0]?.[0])
      raw = cell.text
      plan = parseMysqlJsonPlan(cell.json)
    }
  } else {
    const rows = out.rows.map((r) => ({ id: Number(r[0]), parent: Number(r[1]), detail: String(r[3]) }))
    raw = rows.map((r) => `${r.id} ← ${r.parent}  ${r.detail}`).join('\n')
    plan = parseSqlitePlan(rows)
  }
  return {
    dialect,
    analyzed: !!req.analyze,
    statement,
    plan,
    raw,
    durationMs: Math.round(performance.now() - started),
  }
}
