import type { Kysely } from 'kysely'
import { csvLine, jsonSafe, type ExportFormat } from '#shared/export-format'
import { classifyStatement, splitStatements } from '#shared/sql-split'
import type { FilterNode } from '#shared/types/rows'
import { getConnection } from '../connections/repository'
import { connectionDriver, defaultSchemaOf, readSchema } from '../schema/service'
import type { StoreSchema } from '../store/db'
import { QueryInputError } from './errors'
import { findTable, planRows } from './plan'
import { resolveScope, withFilter } from './relations-service'
import { serializeRow, serializeValue } from './serialize'
import { uniqueColumnNames } from './raw-query-service'

type Db = Kysely<StoreSchema>

/** Excel needs the byte order mark to read UTF-8 CSV. */
const BOM = '\uFEFF'

/** Where exported text goes. `write` is awaited (back-pressure); `aborted` turns true when the client left. */
export interface ExportSink {
  write(chunk: string): Promise<void>
  readonly aborted: () => boolean
}

/** Formats rows as CSV or a JSON array, chunk by chunk. */
class RowWriter {
  private count = 0
  constructor(
    private readonly format: ExportFormat,
    private readonly sink: ExportSink,
  ) {}

  async start(columns: string[]): Promise<void> {
    await this.sink.write(this.format === 'csv' ? `${BOM}${csvLine(columns)}\r\n` : '[')
    this.columns = columns
  }
  private columns: string[] = []

  async rows(rows: Record<string, unknown>[]): Promise<void> {
    let chunk = ''
    for (const row of rows) {
      if (this.format === 'csv') chunk += `${csvLine(this.columns.map((c) => row[c]))}\r\n`
      else chunk += `${this.count === 0 ? '\n' : ',\n'}${JSON.stringify(row, jsonSafe)}`
      this.count++
    }
    await this.sink.write(chunk)
  }

  async end(): Promise<number> {
    if (this.format === 'json') await this.sink.write(this.count > 0 ? '\n]\n' : ']\n')
    return this.count
  }
}

/**
 * Streams the result of one read statement. Memory stays at one batch whatever the size: the
 * driver hands rows over in batches and the sink applies back-pressure. `limit` caps the rows
 * (absent = all). Anything that is not a read is refused: an export never writes.
 */
export async function streamQueryExport(
  db: Db,
  connectionId: string,
  req: { sql: string; schema?: string; format: ExportFormat; limit?: number },
  sink: ExportSink,
  onSession?: (cancel: () => Promise<void>) => void,
): Promise<number> {
  const connection = await getConnection(db, connectionId)
  const dialect = connection.dialect
  const statements = splitStatements(req.sql, dialect)
  if (statements.length !== 1) throw new QueryInputError(400, 'Export works on exactly one statement')
  const statement = statements[0]!.sql
  if (classifyStatement(statement, dialect) !== 'read') throw new QueryInputError(400, 'Only read statements can be exported')

  const schema = req.schema || defaultSchemaOf(dialect, connection.defaultSchema, connection.database)
  const driver = await connectionDriver(db, connectionId)
  const session = await driver.openQuerySession({ schema: schema || undefined, readonly: true })
  onSession?.(() => session.cancel())
  const writer = new RowWriter(req.format, sink)
  let names: string[] = []
  let sent = 0
  let limitReached = false
  try {
    await session.stream(statement, {
      async onColumns(columns) {
        names = uniqueColumnNames(columns.map((c) => c.name))
        await writer.start(names)
      },
      async onRows(rows) {
        if (sink.aborted()) {
          await session.cancel()
          throw new QueryInputError(400, 'Export aborted')
        }
        let batch = rows
        if (req.limit !== undefined) {
          const room = req.limit - sent
          if (room <= 0) return
          batch = rows.slice(0, room)
        }
        sent += batch.length
        await writer.rows(
          batch.map((row) => {
            const obj: Record<string, unknown> = {}
            names.forEach((n, i) => (obj[n] = serializeValue(row[i])))
            return obj
          }),
        )
        if (req.limit !== undefined && sent >= req.limit) {
          limitReached = true
          await session.cancel()
          throw new Error('limit reached')
        }
      },
    })
  } catch (err) {
    // Stopping the driver at the limit surfaces as an error of its own: that one is expected.
    if (!limitReached) throw err
  } finally {
    await session.close({ discard: true }).catch(() => {})
  }
  return writer.end()
}

const PAGE = 1000

/**
 * Streams a table, with the grid's filter, sort and scope, by paging through `readRows` (the
 * primary key is always part of the sort, so pages do not overlap).
 */
export async function streamTableExport(
  db: Db,
  connectionId: string,
  table: string,
  req: {
    schema: string
    filter: FilterNode | null
    sort: { column: string; direction: 'asc' | 'desc' }[]
    format: ExportFormat
    columns?: string[]
    scope?: Parameters<typeof resolveScope>[4] | null
    limit?: number
  },
  sink: ExportSink,
): Promise<number> {
  const { snapshot, graph } = await readSchema(db, connectionId, req.schema)
  const info = findTable(snapshot, table)
  const driver = await connectionDriver(db, connectionId)
  let filter = req.filter
  let junction = null
  if (req.scope) {
    const scope = await resolveScope(driver, snapshot, graph, table, req.scope)
    if (!scope.empty) {
      filter = withFilter(filter, scope.filter)
      junction = scope.junction
    } else {
      const w = new RowWriter(req.format, sink)
      await w.start(req.columns ?? info.columns.map((c) => c.name))
      return w.end()
    }
  }
  const names = req.columns ?? info.columns.map((c) => c.name)
  const writer = new RowWriter(req.format, sink)
  await writer.start(names)
  let offset = 0
  while (!sink.aborted()) {
    const size = req.limit === undefined ? PAGE : Math.min(PAGE, req.limit - offset)
    if (size <= 0) break
    const plan = {
      ...planRows(snapshot, table, { schema: req.schema, filter, sort: req.sort, limit: size, offset, columns: names }),
      junction,
    }
    const rows = (await driver.readRows(plan)).map(serializeRow)
    if (rows.length === 0) break
    await writer.rows(rows)
    offset += rows.length
    if (rows.length < size) break
  }
  return writer.end()
}
