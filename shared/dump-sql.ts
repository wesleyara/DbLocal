import { addForeignKeySql, createTableSql, draftFromTable, indexName, type DdlDialect, type TableDraft } from './ddl'
import type { SchemaColumn, SchemaTable } from './types/db'

/**
 * Pieces of a logical dump (`.sql`). Pure: the server streams them, reading the data page by page.
 * Names are written without a schema, so a dump restores into whatever schema (Postgres) or
 * database (MySQL) the restoring session points at. Postgres and MySQL get their foreign keys after
 * the data; SQLite keeps them inline and turns enforcement off for the load.
 */

/** Placeholder schema the DDL builders write; removed from every statement of the dump. */
const PLACEHOLDER = '__dblocal_dump__'

const quoteIdent = (dialect: DdlDialect, name: string): string =>
  dialect === 'mysql' ? `\`${name.replace(/`/g, '``')}\`` : `"${name.replace(/"/g, '""')}"`

const unqualify = (dialect: DdlDialect, sql: string): string => sql.split(`${quoteIdent(dialect, PLACEHOLDER)}.`).join('')

/** Rows per INSERT statement. */
export const DUMP_INSERT_ROWS = 100

/** Statements that open a dump: comments plus what the load needs (no FK checks while loading). */
export function dumpHeader(dialect: DdlDialect, source: string, at: Date): string[] {
  const lines = [`-- DbLocal dump of ${source.replace(/\s+/g, ' ')} (${dialect}), ${at.toISOString()}`, '-- Restore it in DbLocal (Restore…) or with the database client.']
  if (dialect === 'mysql') lines.push('SET FOREIGN_KEY_CHECKS = 0;', "SET time_zone = '+00:00';")
  if (dialect === 'sqlite') lines.push('PRAGMA foreign_keys = OFF;')
  return lines
}

export function dumpFooter(dialect: DdlDialect): string[] {
  if (dialect === 'mysql') return ['SET FOREIGN_KEY_CHECKS = 1;']
  if (dialect === 'sqlite') return ['PRAGMA foreign_keys = ON;']
  return []
}

/**
 * Tables with the ones they reference first, so rows load parent before child. Self references
 * do not count; a cycle keeps the remaining tables in their original order.
 */
export function tableOrder(tables: SchemaTable[]): SchemaTable[] {
  const byName = new Map(tables.map((t) => [t.name, t]))
  const done = new Set<string>()
  const visiting = new Set<string>()
  const out: SchemaTable[] = []
  const visit = (t: SchemaTable) => {
    if (done.has(t.name) || visiting.has(t.name)) return
    visiting.add(t.name)
    for (const fk of t.foreignKeys) {
      const parent = byName.get(fk.refTable)
      if (parent && parent.name !== t.name) visit(parent)
    }
    visiting.delete(t.name)
    done.add(t.name)
    out.push(t)
  }
  for (const t of tables) visit(t)
  return out
}

/** Postgres serial columns (`nextval(...)` default): their sequence is not dumped, so they become identities. */
const isSerial = (c: SchemaColumn) => /^nextval\(/i.test(c.default ?? '')

/** Columns written in INSERT: computed ones are left to the database. */
export const dataColumns = (table: SchemaTable): SchemaColumn[] => table.columns.filter((c) => !c.isGenerated || c.identity)

/** Postgres enum types used by the tables, as `CREATE TYPE` (deduplicated). */
export function enumTypesSql(tables: SchemaTable[]): string[] {
  const seen = new Map<string, string[]>()
  for (const t of tables) {
    for (const c of t.columns) {
      if (c.kind !== 'enum' || !c.enumValues) continue
      const name = c.nativeType.replace(/\[\]$/, '')
      if (!seen.has(name)) seen.set(name, c.enumValues)
    }
  }
  return [...seen].map(([name, values]) => `CREATE TYPE ${name} AS ENUM (${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')});`)
}

/** The table's draft as a dump writes it. */
function dumpDraft(dialect: DdlDialect, table: SchemaTable): TableDraft {
  const draft = draftFromTable(table)
  for (const c of draft.columns) {
    const live = table.columns.find((x) => x.name === c.from)!
    if (dialect === 'postgres' && isSerial(live)) {
      c.identity = true
      c.default = null
    }
  }
  // SQLite's autoindexes (inline UNIQUE) cannot be created under that reserved name.
  for (const i of draft.indexes) {
    if (i.name.startsWith('sqlite_autoindex_')) i.name = indexName(table.name, i.columns, i.unique)
  }
  return draft
}

/** CREATE TABLE and indexes; `foreignKeys` are the ALTER TABLE statements to run after the data. */
export function tableDdl(dialect: DdlDialect, table: SchemaTable): { create: string[]; foreignKeys: string[] } {
  const draft = dumpDraft(dialect, table)
  const inline = dialect === 'sqlite'
  const fks = inline ? [] : draft.foreignKeys
  const create = createTableSql(dialect, PLACEHOLDER, { ...draft, foreignKeys: inline ? draft.foreignKeys : [] })
  return {
    create: create.map((s) => unqualify(dialect, s)),
    foreignKeys: fks.map((f) => unqualify(dialect, addForeignKeySql(dialect, PLACEHOLDER, table.name, f))),
  }
}

/** Postgres: moves each identity's sequence past the loaded ids. */
export function sequenceResetSql(dialect: DdlDialect, table: SchemaTable): string[] {
  if (dialect !== 'postgres') return []
  const name = quoteIdent(dialect, table.name)
  return table.columns
    .filter((c) => c.identity || isSerial(c))
    .map((c) => {
      const col = quoteIdent(dialect, c.name)
      return `SELECT setval(pg_get_serial_sequence('${name.replace(/'/g, "''")}', '${c.name.replace(/'/g, "''")}'), coalesce(max(${col}), 0) + 1, false) FROM ${name};`
    })
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

function isoParts(d: Date) {
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`
  return { date, time }
}

const quoteText = (dialect: DdlDialect, text: string): string =>
  dialect === 'mysql' ? `'${text.replace(/\\/g, '\\\\').replace(/'/g, "''")}'` : `'${text.replace(/'/g, "''")}'`

/** Postgres array literal: `{"a","b",NULL}`, nested for multi-dimensional arrays. */
function pgArray(value: unknown[]): string {
  const item = (v: unknown): string => {
    if (v === null || v === undefined) return 'NULL'
    if (Array.isArray(v)) return pgArray(v)
    const text = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return `{${value.map(item).join(',')}}`
}

/** One value as an SQL literal of the dialect, for the column it goes into. */
export function sqlLiteral(dialect: DdlDialect, value: unknown, column: SchemaColumn): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return dialect === 'postgres' ? (value ? 'TRUE' : 'FALSE') : value ? '1' : '0'
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : quoteText(dialect, String(value))
  if (value instanceof Uint8Array) {
    const hex = Buffer.from(value).toString('hex')
    return dialect === 'postgres' ? `'\\x${hex}'::bytea` : `X'${hex}'`
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return 'NULL'
    const { date, time } = isoParts(value)
    // node-pg reads a Postgres `date` as local midnight; MySQL (timezone 'Z') as UTC midnight.
    if (column.kind === 'date') {
      return dialect === 'postgres' ? `'${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}'` : `'${date}'`
    }
    return dialect === 'mysql' ? `'${date} ${time}'` : `'${date}T${time}Z'`
  }
  if (Array.isArray(value) && dialect === 'postgres' && column.kind === 'array') return quoteText(dialect, pgArray(value))
  if (typeof value === 'object') return quoteText(dialect, JSON.stringify(value))
  return quoteText(dialect, String(value))
}

/** A multi-row INSERT of the given rows (keyed by column name). */
export function insertSql(dialect: DdlDialect, table: SchemaTable, columns: SchemaColumn[], rows: Record<string, unknown>[]): string {
  const names = columns.map((c) => quoteIdent(dialect, c.name)).join(', ')
  const values = rows.map((r) => `(${columns.map((c) => sqlLiteral(dialect, r[c.name], c)).join(', ')})`)
  // Postgres refuses explicit values in GENERATED ALWAYS identities without OVERRIDING.
  const overriding = dialect === 'postgres' && columns.some((c) => c.identity) ? ' OVERRIDING SYSTEM VALUE' : ''
  return `INSERT INTO ${quoteIdent(dialect, table.name)} (${names})${overriding} VALUES\n  ${values.join(',\n  ')};`
}

/** MySQL `SHOW CREATE` text names its definer; a restore runs as whoever restores. */
export const stripDefiner = (sql: string): string => sql.replace(/\s+DEFINER\s*=\s*(`[^`]*`|'[^']*'|\S+)@(`[^`]*`|'[^']*'|\S+)/i, '')

/** A view as CREATE VIEW (`definition` is the SELECT, or the whole statement for SQLite). */
export function viewSql(dialect: DdlDialect, name: string, definition: string): string {
  const body = definition.trim().replace(/;\s*$/, '')
  if (/^create\s/i.test(body)) return `${stripDefiner(body)};`
  return `CREATE VIEW ${quoteIdent(dialect, name)} AS\n${body};`
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * A routine or trigger definition as one statement of the dump. Postgres writes the source schema
 * into `CREATE FUNCTION schema.name`, `ON schema.table` and `EXECUTE FUNCTION schema.name()`: it is dropped so the
 * restore lands in the session's schema like the tables.
 */
export function definitionSql(dialect: DdlDialect, sql: string, schema: string): string {
  let text = stripDefiner(sql.trim()).replace(/;\s*$/, '')
  if (dialect === 'postgres') {
    const qualifier = `(?:${escapeRegExp(schema)}|"${escapeRegExp(schema.replace(/"/g, '""'))}")\\.`
    text = text.replace(new RegExp(`\\b(FUNCTION|PROCEDURE|ON)\\s+${qualifier}`, 'gi'), '$1 ')
  }
  return `${text};`
}
