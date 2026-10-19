import type { Kysely } from 'kysely'
import {
  DUMP_INSERT_ROWS,
  dataColumns,
  definitionSql,
  dumpFooter,
  dumpHeader,
  enumTypesSql,
  insertSql,
  sequenceResetSql,
  tableDdl,
  tableOrder,
  viewSql,
} from '#shared/dump-sql'
import type { DumpRequest } from '#shared/types/backup'
import { getConnection } from '../connections/repository'
import type { QuerySession } from '../drivers/types'
import type { ExportSink } from '../query/export-service'
import { planRows } from '../query/plan'
import { connectionDriver, readSchema } from '../schema/service'
import type { StoreSchema } from '../store/db'

type Db = Kysely<StoreSchema>

const PAGE = 500

const literal = (text: string) => `'${text.replace(/'/g, "''")}'`

/** View definitions of the schema, read through a read-only session (no driver method needed). */
async function viewDefinitions(session: QuerySession, dialect: string, schema: string): Promise<Map<string, string>> {
  const sql =
    dialect === 'postgres'
      ? `SELECT viewname, definition FROM pg_views WHERE schemaname = ${literal(schema)}`
      : dialect === 'mysql'
        ? `SELECT TABLE_NAME, VIEW_DEFINITION FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ${literal(schema)}`
        : `SELECT name, sql FROM "${schema.replace(/"/g, '""')}".sqlite_schema WHERE type = 'view'`
  const out = await session.run(sql, 100_000)
  return new Map(out.rows.map((r) => [String(r[0]), String(r[1] ?? '')]))
}

/**
 * Streams a logical dump of a schema as SQL: enum types, tables in foreign key order with their
 * indexes, the rows as multi-row INSERTs (paged through `readRows`, so memory stays at one page),
 * then the foreign keys, identity sequences, views, routines and triggers. Triggers come last so
 * they do not fire while the rows load.
 */
export async function streamDump(db: Db, connectionId: string, req: DumpRequest, sink: ExportSink): Promise<number> {
  const connection = await getConnection(db, connectionId)
  const dialect = connection.dialect
  const { snapshot } = await readSchema(db, connectionId, req.schema, { refresh: true })
  const driver = await connectionDriver(db, connectionId)
  const wanted = req.tables?.length ? new Set(req.tables) : null
  const tables = tableOrder(snapshot.tables.filter((t) => t.kind === 'table' && (!wanted || wanted.has(t.name))))
  const views = snapshot.tables.filter((t) => t.kind === 'view' && (!wanted || wanted.has(t.name)))
  let rowsWritten = 0

  const write = (lines: string[]) => (lines.length ? sink.write(`${lines.join('\n')}\n`) : Promise.resolve())
  const section = (title: string) => sink.write(`\n-- ${title}\n`)

  await write(dumpHeader(dialect, `${connection.name} / ${snapshot.schema}`, new Date()))

  const ddl = new Map(tables.map((t) => [t.name, tableDdl(dialect, t)]))
  if (req.structure) {
    if (dialect === 'postgres') {
      const types = enumTypesSql(tables)
      if (types.length) {
        await section('Types')
        await write(types)
      }
    }
    for (const t of tables) {
      await section(`Table ${t.name}`)
      await write(ddl.get(t.name)!.create)
    }
  }

  if (req.data) {
    for (const t of tables) {
      if (sink.aborted()) return rowsWritten
      const columns = dataColumns(t)
      if (columns.length === 0) continue
      let offset = 0
      let first = true
      for (;;) {
        if (sink.aborted()) return rowsWritten
        const plan = planRows(snapshot, t.name, {
          schema: snapshot.schema,
          filter: null,
          sort: [],
          limit: PAGE,
          offset,
          columns: columns.map((c) => c.name),
        })
        const rows = await driver.readRows(plan)
        if (rows.length === 0) break
        if (first) await section(`Data ${t.name}`)
        first = false
        const statements: string[] = []
        for (let i = 0; i < rows.length; i += DUMP_INSERT_ROWS) {
          statements.push(insertSql(dialect, t, columns, rows.slice(i, i + DUMP_INSERT_ROWS)))
        }
        await write(statements)
        rowsWritten += rows.length
        offset += rows.length
        if (rows.length < PAGE) break
      }
    }
  }

  if (req.structure) {
    const fks = tables.flatMap((t) => ddl.get(t.name)!.foreignKeys)
    if (fks.length) {
      await section('Foreign keys')
      await write(fks)
    }
    if (req.data) {
      const resets = tables.flatMap((t) => sequenceResetSql(dialect, t))
      if (resets.length) {
        await section('Identity sequences')
        await write(resets)
      }
    }

    const { routines, triggers } = await driver.listRoutines(snapshot.schema)
    const wantedTriggers = triggers.filter((tr) => !wanted || wanted.has(tr.table))
    if (!wanted && routines.length) {
      await section('Functions and procedures')
      await write(routines.map((r) => definitionSql(dialect, r.definition, snapshot.schema)))
    }
    if (views.length) {
      const session = await driver.openQuerySession({ schema: snapshot.schema, readonly: true })
      try {
        const definitions = await viewDefinitions(session, dialect, snapshot.schema)
        const statements = views.filter((v) => definitions.get(v.name)).map((v) => viewSql(dialect, v.name, definitions.get(v.name)!))
        if (statements.length) {
          await section('Views')
          await write(statements)
        }
      } finally {
        await session.close().catch(() => {})
      }
    }
    if (wantedTriggers.length) {
      await section('Triggers')
      await write(wantedTriggers.map((tr) => definitionSql(dialect, tr.definition, snapshot.schema)))
    }
  }

  await write(['', ...dumpFooter(dialect)])
  return rowsWritten
}
