/**
 * Foreign key tuples follow SQL's MATCH SIMPLE: a key with any NULL part is not checked and relates
 * to nothing, so it has no parent (shown like NULL), never an orphan.
 */
export function hasNullPart(values: readonly unknown[]): boolean {
  return values.some((v) => v === null || v === undefined)
}

/** True when any of the FK `columns` is NULL in `row`. */
export function fkHasNull(columns: readonly string[], row: Record<string, unknown>): boolean {
  return hasNullPart(columns.map((c) => row[c]))
}
