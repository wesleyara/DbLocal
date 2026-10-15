import type { SchemaTable } from './types/db'

/**
 * The columns that address one row of a table for UPDATE and DELETE: the primary key, or, when
 * there is none, a unique index whose columns are all NOT NULL. Null when the table cannot be
 * edited (views, tables without a usable key, SQLite's implicit rowid).
 */
export function editableKey(table: SchemaTable): string[] | null {
  if (table.kind !== 'table') return null
  if (table.primaryKey.length > 0 && !table.implicitRowid) return table.primaryKey
  const notNull = new Set(table.columns.filter((c) => !c.nullable).map((c) => c.name))
  const unique = table.indexes.find((i) => i.unique && !i.primary && i.columns.length > 0 && i.columns.every((c) => notNull.has(c)))
  return unique ? [...unique.columns] : null
}

/** Why a table is read-only, for the warning in the grid. Null when it is editable. */
export function readOnlyReason(table: SchemaTable): 'view' | 'no-key' | null {
  if (table.kind !== 'table') return 'view'
  return editableKey(table) ? null : 'no-key'
}
