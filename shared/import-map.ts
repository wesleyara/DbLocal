import { editableKey } from './editable'
import { parsePlain, type ParsedInput } from './edit-values'
import type { ImportData } from './import-parse'
import type { SchemaColumn, SchemaTable } from './types/db'
import type { MutationOp, MutationValue } from './types/mutations'

/**
 * Turns parsed file rows into mutation ops for one table: which file column feeds which table
 * column, and the value of each cell checked against the column kind (the same rules as typing in
 * the grid, without the value functions). Pure, shared by the dialog and the tests.
 */

export type ImportMode = 'insert' | 'upsert'

/** File column -> table column, or null to leave it out. */
export type ImportMapping = Record<string, string | null>

export interface ImportOptions {
  mode: ImportMode
  /** An empty cell is NULL (or the column default, when the column is NOT NULL and has one). */
  emptyAsNull: boolean
}

export type ImportCellErrorCode = Exclude<ParsedInput, { ok: true }>['error'] | 'boolean' | 'text'

export interface ImportCellError {
  /** Position of the record in the file, from 0 (the header is not counted). */
  row: number
  column: string
  code: ImportCellErrorCode
}

export interface ImportBuild {
  ops: MutationOp[]
  /** For each op, the record it came from. */
  rows: number[]
  /** Records with at least one invalid cell are left out of `ops`. */
  errors: ImportCellError[]
  invalidRows: number
}

/** Rows per request: under `MAX_MUTATION_OPS`, and each request is one transaction. */
export const IMPORT_BATCH = 1000

/** Columns a file can fill: computed columns and bytes cannot; identity columns can. */
export function importableColumns(table: SchemaTable): SchemaColumn[] {
  return table.columns.filter((c) => (!c.isGenerated || c.identity) && c.kind !== 'binary')
}

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Maps each file column to the table column of the same name (case, `_`, `-` and spaces ignored). */
export function autoMapping(fileColumns: string[], table: SchemaTable): ImportMapping {
  const byName = new Map(importableColumns(table).map((c) => [normalize(c.name), c.name]))
  const used = new Set<string>()
  const mapping: ImportMapping = {}
  for (const name of fileColumns) {
    const target = byName.get(normalize(name)) ?? null
    mapping[name] = target && !used.has(target) ? target : null
    if (target) used.add(target)
  }
  return mapping
}

/**
 * Table columns the mapping leaves out but the import needs: NOT NULL columns without a default
 * (an insert would fail) and, for an upsert, every key column (it decides insert or update).
 */
export function missingColumns(table: SchemaTable, mapping: ImportMapping, mode: ImportMode): string[] {
  const mapped = new Set(Object.values(mapping).filter((v): v is string => v !== null))
  const key = editableKey(table) ?? []
  return table.columns
    .filter((c) => !mapped.has(c.name))
    .filter((c) => (mode === 'upsert' && key.includes(c.name)) || (!c.nullable && c.default === null && !c.isGenerated))
    .map((c) => c.name)
}

const TRUE = new Set(['true', 't', '1', 'yes', 'y', 'sim', 's', 'on'])
const FALSE = new Set(['false', 'f', '0', 'no', 'n', 'não', 'nao', 'off'])
const TEXT_KINDS = new Set(['string', 'uuid', 'enum', 'other'])

type Cell = { ok: true; value: MutationValue | undefined } | { ok: false; code: ImportCellErrorCode }

function emptyCell(column: SchemaColumn, options: ImportOptions): Cell {
  if (!options.emptyAsNull) return { ok: true, value: TEXT_KINDS.has(column.kind) ? '' : null }
  if (!column.nullable && (column.default !== null || column.isGenerated)) return { ok: true, value: { $default: true } }
  return { ok: true, value: null }
}

/** The value to send for one cell. `undefined` (a JSON record without the key) leaves the column out. */
export function cellValue(column: SchemaColumn, raw: unknown, options: ImportOptions): Cell {
  if (raw === undefined) return { ok: true, value: undefined }
  if (raw === null) return { ok: true, value: null }
  if (typeof raw === 'string' && raw === '') return emptyCell(column, options)

  if (column.kind === 'boolean') {
    if (typeof raw === 'boolean') return { ok: true, value: raw }
    const text = String(raw).trim().toLowerCase()
    if (TRUE.has(text)) return { ok: true, value: true }
    if (FALSE.has(text)) return { ok: true, value: false }
    return { ok: false, code: 'boolean' }
  }
  if (typeof raw === 'object') {
    if (column.kind === 'json') return { ok: true, value: raw as MutationValue }
    if (column.kind === 'array') return Array.isArray(raw) ? { ok: true, value: raw } : { ok: false, code: 'array' }
    if (TEXT_KINDS.has(column.kind)) return { ok: true, value: JSON.stringify(raw) }
    return { ok: false, code: 'text' }
  }
  if (typeof raw === 'number' && column.kind === 'number') return { ok: true, value: raw }
  // Text cells (and JSON scalars) go through the grid's parser, so the rules match typing a value.
  if (column.kind === 'json' && typeof raw !== 'string') return { ok: true, value: raw as MutationValue }
  const parsed = parsePlain(column, String(raw))
  return parsed.ok ? { ok: true, value: parsed.value as MutationValue } : { ok: false, code: parsed.error }
}

/** Builds one op per valid record (`insert`, or `upsert` by the table's editable key). */
export function buildImportOps(data: ImportData, mapping: ImportMapping, table: SchemaTable, options: ImportOptions): ImportBuild {
  const columns = new Map(table.columns.map((c) => [c.name, c]))
  const targets = data.columns
    .map((name, index) => ({ index, name, column: mapping[name] ? columns.get(mapping[name]!) : undefined }))
    .filter((t): t is { index: number; name: string; column: SchemaColumn } => t.column !== undefined)

  const ops: MutationOp[] = []
  const rows: number[] = []
  const errors: ImportCellError[] = []
  let invalidRows = 0
  data.rows.forEach((record, row) => {
    const values: Record<string, MutationValue> = {}
    let valid = true
    for (const target of targets) {
      const cell = cellValue(target.column, record[target.index], options)
      if (!cell.ok) {
        valid = false
        errors.push({ row, column: target.name, code: cell.code })
      } else if (cell.value !== undefined) values[target.column.name] = cell.value
    }
    if (!valid) {
      invalidRows++
      return
    }
    ops.push(options.mode === 'upsert' ? { type: 'upsert', table: table.name, values } : { type: 'insert', table: table.name, values })
    rows.push(row)
  })
  return { ops, rows, errors, invalidRows }
}

/** Splits a list in consecutive slices of `size`. */
export function batches<T>(list: T[], size = IMPORT_BATCH): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}
