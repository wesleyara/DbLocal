import type { ColumnKind, SchemaColumn, SchemaForeignKey, SchemaIndex, SchemaSnapshot, SchemaTable } from '#shared/types/db'
import { referentialAction, snapshotOf, type QueryFn } from './common'

interface ObjectRow {
  name: string
  type: string
}

interface XInfoRow {
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
  hidden: number
}

interface ForeignKeyRow {
  id: number
  seq: number
  table: string
  from: string
  to: string | null
  on_update: string
  on_delete: string
}

interface IndexListRow {
  name: string
  unique: number
  origin: string
}

interface IndexInfoRow {
  name: string | null
}

const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`
const quoteString = (value: string): string => `'${value.replace(/'/g, "''")}'`

/**
 * Normalised kind from the declared type, following SQLite's type affinity rules
 * (https://www.sqlite.org/datatype3.html), with the common names checked first.
 */
export function sqliteKind(declared: string): ColumnKind {
  const t = declared.toUpperCase()
  if (t.includes('BOOL')) return 'boolean'
  if (t.includes('DATETIME') || t.includes('TIMESTAMP')) return 'datetime'
  if (t === 'DATE') return 'date'
  if (t === 'TIME') return 'time'
  if (t.includes('JSON')) return 'json'
  if (t.includes('UUID')) return 'uuid'
  if (t.includes('BLOB')) return 'binary'
  if (t.includes('INT')) return 'number'
  if (t.includes('CHAR') || t.includes('CLOB') || t.includes('TEXT')) return 'string'
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB') || t.includes('NUMERIC') || t.includes('DECIMAL')) {
    return 'number'
  }
  return 'other'
}

export async function introspectSqlite(query: QueryFn, schema: string): Promise<SchemaSnapshot> {
  const s = quoteIdent(schema)
  const objects = await query<ObjectRow>(
    `SELECT name, type FROM ${s}.sqlite_schema
     WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
     ORDER BY name`,
  )

  const out: SchemaTable[] = []
  for (const obj of objects) {
    const table = quoteString(obj.name)
    const info = await query<XInfoRow>(`PRAGMA ${s}.table_xinfo(${table})`)
    const pk = info
      .filter((c) => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name)

    const columns: SchemaColumn[] = info
      .filter((c) => c.hidden !== 1)
      .map((c) => ({
        name: c.name,
        nativeType: c.type,
        kind: sqliteKind(c.type),
        nullable: c.notnull === 0,
        default: c.dflt_value,
        isGenerated: c.hidden === 2 || c.hidden === 3,
        isPrimaryKey: pk.includes(c.name),
        comment: null,
        enumValues: null,
      }))

    const fkRows = await query<ForeignKeyRow>(`PRAGMA ${s}.foreign_key_list(${table})`)
    const foreignKeys = groupById(fkRows).map(
      (parts): SchemaForeignKey => ({
        name: `fk_${obj.name}_${parts[0]!.id}`,
        columns: parts.map((p) => p.from),
        refSchema: schema,
        refTable: parts[0]!.table,
        // Without `to`, the FK targets the parent's primary key: resolved below once every table is read.
        refColumns: parts.every((p) => p.to !== null) ? parts.map((p) => p.to!) : [],
        onDelete: referentialAction(parts[0]!.on_delete),
        onUpdate: referentialAction(parts[0]!.on_update),
      }),
    )

    const indexes: SchemaIndex[] = []
    const indexRows = await query<IndexListRow>(`PRAGMA ${s}.index_list(${table})`)
    for (const idx of indexRows) {
      const cols = await query<IndexInfoRow>(`PRAGMA ${s}.index_info(${quoteString(idx.name)})`)
      indexes.push({
        name: idx.name,
        columns: cols.map((c) => c.name ?? '').filter(Boolean),
        unique: idx.unique === 1,
        primary: idx.origin === 'pk',
      })
    }

    // A rowid table (no WITHOUT ROWID clause) without a declared PK is keyed by its implicit rowid.
    const isTable = obj.type !== 'view'
    const implicitRowid = isTable && pk.length === 0
    out.push({
      name: obj.name,
      kind: obj.type === 'view' ? 'view' : 'table',
      columns,
      primaryKey: implicitRowid ? ['rowid'] : pk,
      implicitRowid,
      foreignKeys,
      indexes,
      rowEstimate: null,
      comment: null,
    })
  }

  resolveImplicitTargets(out)
  return snapshotOf('sqlite', schema, out)
}

function groupById(rows: ForeignKeyRow[]): ForeignKeyRow[][] {
  const groups = new Map<number, ForeignKeyRow[]>()
  for (const row of rows) {
    const bucket = groups.get(row.id)
    if (bucket) bucket.push(row)
    else groups.set(row.id, [row])
  }
  return [...groups.values()].map((g) => g.sort((a, b) => a.seq - b.seq))
}

/** FKs written without target columns reference the parent's primary key. */
function resolveImplicitTargets(tables: SchemaTable[]): void {
  const byName = new Map(tables.map((t) => [t.name, t]))
  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      if (fk.refColumns.length === 0) fk.refColumns = byName.get(fk.refTable)?.primaryKey ?? []
    }
  }
}
