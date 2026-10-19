import type { ColumnKind, SchemaColumn, SchemaForeignKey, SchemaIndex, SchemaSnapshot, SchemaTable } from '#shared/types/db'
import { groupBy, parseEnumValues, referentialAction, snapshotOf, type QueryFn } from './common'

interface TableRow {
  name: string
  type: string
  rows: number | string | null
  comment: string | null
}

interface ColumnRow {
  table_name: string
  name: string
  native_type: string
  data_type: string
  nullable: string
  default_value: string | null
  extra: string
  comment: string | null
}

interface ForeignKeyRow {
  table_name: string
  name: string
  column: string
  ref_table: string
  ref_column: string
  delete_rule: string
  update_rule: string
}

interface IndexRow {
  table_name: string
  name: string
  non_unique: number
  column: string
}

const TABLES_SQL = `
  SELECT TABLE_NAME AS name, TABLE_TYPE AS type, TABLE_ROWS AS \`rows\`, TABLE_COMMENT AS comment
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = ?
  ORDER BY TABLE_NAME`

const COLUMNS_SQL = `
  SELECT TABLE_NAME AS table_name, COLUMN_NAME AS name, COLUMN_TYPE AS native_type,
         DATA_TYPE AS data_type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS default_value,
         EXTRA AS extra, COLUMN_COMMENT AS comment
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = ?
  ORDER BY TABLE_NAME, ORDINAL_POSITION`

const FOREIGN_KEYS_SQL = `
  SELECT k.TABLE_NAME AS table_name, k.CONSTRAINT_NAME AS name, k.COLUMN_NAME AS \`column\`,
         k.REFERENCED_TABLE_NAME AS ref_table, k.REFERENCED_COLUMN_NAME AS ref_column,
         r.DELETE_RULE AS delete_rule, r.UPDATE_RULE AS update_rule
  FROM information_schema.KEY_COLUMN_USAGE k
  JOIN information_schema.REFERENTIAL_CONSTRAINTS r
    ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
   AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
   AND r.TABLE_NAME = k.TABLE_NAME
  WHERE k.TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL
  ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`

const INDEXES_SQL = `
  SELECT TABLE_NAME AS table_name, INDEX_NAME AS name, NON_UNIQUE AS non_unique, COLUMN_NAME AS \`column\`
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = ?
  ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`

/**
 * `COLUMN_DEFAULT` as an SQL expression, like Postgres and SQLite report it: a literal comes back
 * bare (`user`), so it is quoted; an expression default (`DEFAULT_GENERATED`) stays as written,
 * in parentheses unless it is `CURRENT_TIMESTAMP`. The structure editor writes it back as is.
 */
export function mysqlDefault(value: string | null, extra: string, kind: ColumnKind): string | null {
  if (value === null) return null
  if (extra.toLowerCase().includes('default_generated')) {
    return /^(current_timestamp|now)(\(\d*\))?$/i.test(value) || /^\(.*\)$/.test(value) ? value : `(${value})`
  }
  if ((kind === 'number' || kind === 'boolean') && /^-?\d+(\.\d+)?$/.test(value)) return value
  if (/^b'[01]*'$/.test(value)) return value
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
}

/** Normalised kind from MySQL's `DATA_TYPE` and the full `COLUMN_TYPE`. `tinyint(1)` is a boolean. */
export function mysqlKind(dataType: string, nativeType: string): ColumnKind {
  const t = dataType.toLowerCase()
  if (t === 'tinyint' && /^tinyint\(1\)/i.test(nativeType)) return 'boolean'
  if (['tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint', 'decimal', 'numeric', 'float', 'double', 'bit', 'year'].includes(t)) return 'number'
  if (['char', 'varchar', 'text', 'tinytext', 'mediumtext', 'longtext', 'set'].includes(t)) return 'string'
  if (t === 'date') return 'date'
  if (t === 'datetime' || t === 'timestamp') return 'datetime'
  if (t === 'time') return 'time'
  if (t === 'json') return 'json'
  if (t === 'enum') return 'enum'
  if (['binary', 'varbinary', 'blob', 'tinyblob', 'mediumblob', 'longblob'].includes(t)) return 'binary'
  return 'other'
}

export async function introspectMysql(query: QueryFn, database: string): Promise<SchemaSnapshot> {
  const [tables, columns, fks, indexes] = await Promise.all([
    query<TableRow>(TABLES_SQL, [database]),
    query<ColumnRow>(COLUMNS_SQL, [database]),
    query<ForeignKeyRow>(FOREIGN_KEYS_SQL, [database]),
    query<IndexRow>(INDEXES_SQL, [database]),
  ])

  const columnsBy = groupBy(columns, (c) => c.table_name)
  const fksBy = groupBy(fks, (f) => f.table_name)
  const indexesBy = groupBy(indexes, (i) => i.table_name)

  const out: SchemaTable[] = tables.map((t) => {
    const indexList: SchemaIndex[] = [...groupBy(indexesBy.get(t.name) ?? [], (i) => i.name)].map(
      ([name, parts]) => ({
        name,
        columns: parts.map((p) => p.column),
        unique: parts[0]!.non_unique === 0,
        primary: name === 'PRIMARY',
      }),
    )
    const pk = indexList.find((i) => i.primary)?.columns ?? []

    const cols: SchemaColumn[] = (columnsBy.get(t.name) ?? []).map((c) => {
      const kind = mysqlKind(c.data_type, c.native_type)
      const extra = c.extra.toLowerCase()
      // `DEFAULT_GENERATED` only marks an expression default; computed columns say VIRTUAL / STORED GENERATED.
      const computed = /\b(virtual|stored) generated\b/.test(extra)
      return {
        name: c.name,
        nativeType: c.native_type,
        kind,
        nullable: c.nullable === 'YES',
        default: mysqlDefault(c.default_value, c.extra, kind),
        isGenerated: computed || extra.includes('auto_increment'),
        identity: extra.includes('auto_increment') && !computed,
        onUpdate: /on update (\S+)/i.exec(c.extra)?.[1] ?? null,
        isPrimaryKey: pk.includes(c.name),
        comment: c.comment || null,
        enumValues: kind === 'enum' ? parseEnumValues(c.native_type) : null,
      }
    })

    const foreignKeys: SchemaForeignKey[] = [...groupBy(fksBy.get(t.name) ?? [], (f) => f.name)].map(
      ([name, parts]): SchemaForeignKey => ({
        name,
        columns: parts.map((p) => p.column),
        refSchema: database,
        refTable: parts[0]!.ref_table,
        refColumns: parts.map((p) => p.ref_column),
        onDelete: referentialAction(parts[0]!.delete_rule),
        onUpdate: referentialAction(parts[0]!.update_rule),
      }),
    )

    const rowEstimate = t.rows === null ? null : Number(t.rows)
    return {
      name: t.name,
      kind: t.type === 'VIEW' ? 'view' : 'table',
      columns: cols,
      primaryKey: pk,
      foreignKeys,
      indexes: indexList,
      implicitRowid: false,
      rowEstimate,
      comment: t.comment || null,
    }
  })
  return snapshotOf('mysql', database, out)
}
