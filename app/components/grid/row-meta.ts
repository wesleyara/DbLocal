/** Property under which TableGrid attaches the editing state of a row (the grid reads it, columns never use it). */
export const ROW_META = '@meta'

export interface RowMeta {
  /** `new`: not saved yet. `deleted`: marked for deletion. */
  state: 'new' | 'deleted' | null
  /** Columns edited on an existing row, with the value they had when loaded. */
  changed: Record<string, { original: unknown }>
  /** Why the last save failed for this row. */
  error?: string
  /** Key of an existing row (the primary key as loaded, even when it is being edited). */
  key?: Record<string, string | number>
  /** Local id of a new row. */
  id?: string
}

export const isDefaultValue = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && (v as { $default?: unknown }).$default === true

export function metaOf(row: unknown): RowMeta | null {
  return ((row as Record<string, unknown> | null)?.[ROW_META] as RowMeta | undefined) ?? null
}
