import { editableKey } from '#shared/editable'
import type { SchemaColumn, SchemaSnapshot, SchemaTable } from '#shared/types/db'
import type { MutationOp, MutationPlan, PlannedOp } from '#shared/types/mutations'
import { MutationFailedError } from './errors'

/** Stands for "use the column default" inside a planned operation. Never sent as a parameter. */
export const DEFAULT_MARK = Symbol('default')

const fail = (index: number, message: string) => new MutationFailedError(index, 'syntax', message)

const isDefault = (v: unknown): boolean => typeof v === 'object' && v !== null && (v as { $default?: unknown }).$default === true

const NUMERIC = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/

function coerceNumber(index: number, column: SchemaColumn, value: unknown): number | string {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && NUMERIC.test(value.trim())) {
    const text = value.trim()
    const n = Number(text)
    // Integers past 2^53 stay as text, so a bigint id does not lose digits on the way to the database.
    if (/^-?\d+$/.test(text) && !Number.isSafeInteger(n)) return text
    return n
  }
  throw fail(index, `Column ${column.name} expects a number`)
}

function coerceBoolean(index: number, column: SchemaColumn, value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true' || value === 't') return true
  if (value === 0 || value === '0' || value === 'false' || value === 'f') return false
  throw fail(index, `Column ${column.name} expects true or false`)
}

/** MySQL rejects the `Z` / offset forms of an ISO timestamp, so they are rewritten as UTC `YYYY-MM-DD HH:MM:SS.fff`. */
function mysqlDatetime(text: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(text)) return text.replace('T', ' ')
  const d = new Date(text)
  if (Number.isNaN(d.getTime())) return text
  return d.toISOString().replace('T', ' ').replace('Z', '')
}

/**
 * Turns the JSON value the client sent into the parameter the driver binds, checked against the
 * column. Values are never interpolated into SQL; this only shapes them (JSON text, bytes, ...).
 */
export function coerceValue(index: number, column: SchemaColumn, value: unknown, dialect: SchemaSnapshot['dialect']): unknown {
  if (isDefault(value)) return DEFAULT_MARK
  if (value === null) return null
  switch (column.kind) {
    case 'number':
      return coerceNumber(index, column, value)
    case 'boolean':
      return coerceBoolean(index, column, value)
    case 'json':
      // Always sent as JSON text: a JS array would be bound as a Postgres array, an object as `[object Object]`.
      return JSON.stringify(value)
    case 'array':
      if (!Array.isArray(value)) throw fail(index, `Column ${column.name} expects an array`)
      return value
    case 'binary': {
      const b64 = (value as { $binary?: unknown })?.$binary
      if (typeof b64 !== 'string') throw fail(index, `Column ${column.name} expects binary data`)
      return Buffer.from(b64, 'base64')
    }
    case 'enum':
      if (typeof value !== 'string') throw fail(index, `Column ${column.name} expects text`)
      if (column.enumValues && !column.enumValues.includes(value)) {
        throw fail(index, `Column ${column.name}: "${value}" is not one of ${column.enumValues.join(', ')}`)
      }
      return value
    case 'datetime':
      if (typeof value !== 'string') throw fail(index, `Column ${column.name} expects a date and time`)
      return dialect === 'mysql' ? mysqlDatetime(value) : value
    default:
      if (typeof value === 'string') return value
      if (typeof value === 'number' || typeof value === 'boolean') return String(value)
      throw fail(index, `Column ${column.name} expects text`)
  }
}

function requireTable(snapshot: SchemaSnapshot, index: number, name: string): { table: SchemaTable; key: string[] } {
  const table = snapshot.tables.find((t) => t.name === name)
  if (!table) throw new MutationFailedError(index, 'syntax', `Table not found: ${name}`)
  if (table.kind !== 'table') throw fail(index, `${name} is a ${table.kind.replace('_', ' ')} and cannot be edited`)
  const key = editableKey(table)
  if (!key) throw fail(index, `Table ${name} has no primary key or unique NOT NULL key, so it cannot be edited`)
  return { table, key }
}

function coerceValues(
  index: number,
  table: SchemaTable,
  values: Record<string, unknown>,
  dialect: SchemaSnapshot['dialect'],
  allowDefault: boolean,
): Record<string, unknown> {
  const columns = new Map(table.columns.map((c) => [c.name, c]))
  const out: Record<string, unknown> = {}
  for (const [name, raw] of Object.entries(values)) {
    const column = columns.get(name)
    if (!column) throw fail(index, `Unknown column: ${name}`)
    if (column.isGenerated) throw fail(index, `Column ${name} is generated and cannot be set`)
    const value = coerceValue(index, column, raw, dialect)
    if (value === DEFAULT_MARK && !allowDefault) throw fail(index, `DEFAULT is not supported on update in ${dialect}`)
    out[name] = value
  }
  return out
}

function coerceKey(index: number, table: SchemaTable, key: string[], pk: Record<string, unknown>, dialect: SchemaSnapshot['dialect']) {
  const given = Object.keys(pk)
  if (given.length !== key.length || !key.every((k) => given.includes(k))) {
    throw fail(index, `The key of ${table.name} must be exactly: ${key.join(', ')}`)
  }
  const columns = new Map(table.columns.map((c) => [c.name, c]))
  const out: Record<string, unknown> = {}
  for (const name of key) {
    const value = coerceValue(index, columns.get(name)!, pk[name], dialect)
    if (value === null || value === DEFAULT_MARK) throw fail(index, `Key column ${name} needs a value`)
    out[name] = value
  }
  return out
}

/**
 * Checks a batch against the live snapshot and coerces its values. Unknown tables or columns,
 * views, tables without a key and generated columns are rejected here with the index of the
 * offending operation. Updates and deletes address the row by its key, never by position.
 */
export function planMutations(snapshot: SchemaSnapshot, ops: MutationOp[]): MutationPlan {
  const dialect = snapshot.dialect
  const planned = ops.map((op, index): PlannedOp => {
    const { table, key } = requireTable(snapshot, index, op.table)
    switch (op.type) {
      case 'insert':
        return { index, type: 'insert', table: table.name, keyColumns: key, values: coerceValues(index, table, op.values, dialect, true) }
      case 'update': {
        const values = coerceValues(index, table, op.values, dialect, dialect !== 'sqlite')
        if (Object.keys(values).length === 0) throw fail(index, 'An update needs at least one value')
        return { index, type: 'update', table: table.name, keyColumns: key, pk: coerceKey(index, table, key, op.pk, dialect), values }
      }
      case 'delete':
        return { index, type: 'delete', table: table.name, keyColumns: key, pk: coerceKey(index, table, key, op.pk, dialect) }
    }
  })
  return { dialect, schema: snapshot.schema, ops: planned }
}
