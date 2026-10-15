import type { ColumnKind, SchemaColumn } from './types/db'
import type { QueryColumn } from './types/query'

/** Column kind guessed from the type name the driver reports for a result column. */
export function kindFromDriverType(type: string): ColumnKind {
  const v = type.toLowerCase()
  if (/bool/.test(v)) return 'boolean'
  if (/json/.test(v)) return 'json'
  if (/uuid/.test(v)) return 'uuid'
  if (/timestamp|datetime/.test(v)) return 'datetime'
  if (/^date$/.test(v)) return 'date'
  if (/^time/.test(v)) return 'time'
  if (/bytea|blob|binary/.test(v)) return 'binary'
  if (/int|num|dec|float|double|real|serial|money|^oid$/.test(v)) return 'number'
  return 'string'
}

/** A result column as a grid column (no key, nullable, no default). */
export const resultColumn = (c: QueryColumn): SchemaColumn => ({
  name: c.name,
  nativeType: c.type,
  kind: kindFromDriverType(c.type),
  nullable: true,
  default: null,
  isGenerated: false,
  isPrimaryKey: false,
  comment: null,
  enumValues: null,
})
