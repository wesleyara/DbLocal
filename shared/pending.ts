import type { MutationKey, MutationOp, MutationValue } from './types/mutations'

/** An existing row with unsaved edits, addressed by its key (never by its position in the grid). */
export interface PendingRow {
  key: MutationKey
  /** The row as it was loaded: edits that bring a cell back to this value are dropped. */
  original: Record<string, unknown>
  /** Only the columns that changed, with their new value. */
  changes: Record<string, unknown>
  deleted: boolean
  seq: number
}

/** A row that does not exist yet. A column absent from `values` takes its database default. */
export interface PendingInsert {
  id: string
  values: Record<string, unknown>
  seq: number
}

export interface PendingTable {
  rows: Record<string, PendingRow>
  inserts: PendingInsert[]
}

/** Everything unsaved in one workspace tab, per table. All of it is applied in one transaction. */
export interface PendingState {
  tables: Record<string, PendingTable>
  seq: number
  /** Error of the last save attempt, by row id (see `rowIdOf` / insert ids). */
  errors: Record<string, string>
}

export const emptyPending = (): PendingState => ({ tables: {}, seq: 0, errors: {} })

/** Stable id of a key, independent of property order. */
export function keyId(key: MutationKey): string {
  return JSON.stringify(Object.keys(key).sort().map((k) => [k, String(key[k])]))
}

/** Error key of an existing row of a table. Inserts use `table|insert id`. */
export const rowErrorId = (table: string, key: MutationKey): string => `${table}|${keyId(key)}`
export const insertErrorId = (table: string, id: string): string => `${table}|new:${id}`

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return false
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b)
  // `1` and `"1"` are the same cell: ids come back from the server as strings, editors give numbers.
  return String(a) === String(b)
}

function table(state: PendingState, name: string): PendingTable {
  return (state.tables[name] ??= { rows: {}, inserts: [] })
}

function prune(state: PendingState, name: string): void {
  const t = state.tables[name]
  if (t && Object.keys(t.rows).length === 0 && t.inserts.length === 0) Reflect.deleteProperty(state.tables, name)
}

/** Sets a cell of an existing row. Setting it back to the loaded value removes the change. */
export function setCell(
  state: PendingState,
  tableName: string,
  key: MutationKey,
  original: Record<string, unknown>,
  column: string,
  value: unknown,
): void {
  const t = table(state, tableName)
  const id = keyId(key)
  const row = (t.rows[id] ??= { key, original, changes: {}, deleted: false, seq: ++state.seq })
  if (same(value, row.original[column]) && !isDefault(value)) Reflect.deleteProperty(row.changes, column)
  else row.changes[column] = value
  if (!row.deleted && Object.keys(row.changes).length === 0) Reflect.deleteProperty(t.rows, id)
  Reflect.deleteProperty(state.errors, rowErrorId(tableName, key))
  prune(state, tableName)
}

export function setDeleted(
  state: PendingState,
  tableName: string,
  key: MutationKey,
  original: Record<string, unknown>,
  deleted: boolean,
): void {
  const t = table(state, tableName)
  const id = keyId(key)
  const row = (t.rows[id] ??= { key, original, changes: {}, deleted: false, seq: ++state.seq })
  row.deleted = deleted
  if (!deleted && Object.keys(row.changes).length === 0) Reflect.deleteProperty(t.rows, id)
  Reflect.deleteProperty(state.errors, rowErrorId(tableName, key))
  prune(state, tableName)
}

/** Drops every pending change of one existing row (edits and deletion). */
export function undoRow(state: PendingState, tableName: string, key: MutationKey): void {
  const t = state.tables[tableName]
  if (!t) return
  Reflect.deleteProperty(t.rows, keyId(key))
  Reflect.deleteProperty(state.errors, rowErrorId(tableName, key))
  prune(state, tableName)
}

let insertCounter = 0

export function addInsert(state: PendingState, tableName: string, values: Record<string, unknown> = {}): string {
  const id = `n${Date.now().toString(36)}${(insertCounter++).toString(36)}`
  table(state, tableName).inserts.push({ id, values: { ...values }, seq: ++state.seq })
  return id
}

/** `undefined` clears the column, which then takes its default. */
export function setInsertCell(state: PendingState, tableName: string, id: string, column: string, value: unknown): void {
  const insert = state.tables[tableName]?.inserts.find((i) => i.id === id)
  if (!insert) return
  if (value === undefined) Reflect.deleteProperty(insert.values, column)
  else insert.values[column] = value
  Reflect.deleteProperty(state.errors, insertErrorId(tableName, id))
}

export function removeInsert(state: PendingState, tableName: string, id: string): void {
  const t = state.tables[tableName]
  if (!t) return
  t.inserts = t.inserts.filter((i) => i.id !== id)
  Reflect.deleteProperty(state.errors, insertErrorId(tableName, id))
  prune(state, tableName)
}

/** Number of changes as "Save N changes" counts them: one per changed row, new row or deleted row. */
export function pendingCount(state: PendingState, tableName?: string): number {
  const names = tableName ? [tableName] : Object.keys(state.tables)
  let n = 0
  for (const name of names) {
    const t = state.tables[name]
    if (t) n += Object.keys(t.rows).length + t.inserts.length
  }
  return n
}

/** What a mutation operation refers to, to put a save error back on the right row. */
export type OpTarget = { table: string; kind: 'row'; key: MutationKey } | { table: string; kind: 'insert'; id: string }

const isDefault = (v: unknown): boolean => typeof v === 'object' && v !== null && (v as { $default?: unknown }).$default === true

/**
 * The batch for the server. Inserts run first (in creation order, so a new parent exists before
 * its new children), then updates, then deletes.
 */
export function buildOps(state: PendingState): { ops: MutationOp[]; targets: OpTarget[] } {
  const inserts: { seq: number; op: MutationOp; target: OpTarget }[] = []
  const updates: typeof inserts = []
  const deletes: typeof inserts = []
  for (const [name, t] of Object.entries(state.tables)) {
    for (const insert of t.inserts) {
      inserts.push({
        seq: insert.seq,
        op: { type: 'insert', table: name, values: insert.values as Record<string, MutationValue> },
        target: { table: name, kind: 'insert', id: insert.id },
      })
    }
    for (const row of Object.values(t.rows)) {
      const target: OpTarget = { table: name, kind: 'row', key: row.key }
      if (row.deleted) deletes.push({ seq: row.seq, op: { type: 'delete', table: name, pk: row.key }, target })
      else if (Object.keys(row.changes).length > 0) {
        updates.push({ seq: row.seq, op: { type: 'update', table: name, pk: row.key, values: row.changes as Record<string, MutationValue> }, target })
      }
    }
  }
  const bySeq = (a: { seq: number }, b: { seq: number }) => a.seq - b.seq
  const ordered = [...inserts.sort(bySeq), ...updates.sort(bySeq), ...deletes.sort(bySeq)]
  return { ops: ordered.map((o) => o.op), targets: ordered.map((o) => o.target) }
}

/** Puts the error of a failed operation on its row. */
export function markError(state: PendingState, target: OpTarget, message: string): void {
  state.errors[target.kind === 'row' ? rowErrorId(target.table, target.key) : insertErrorId(target.table, target.id)] = message
}
