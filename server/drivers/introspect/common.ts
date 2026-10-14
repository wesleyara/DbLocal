import type { ReferentialAction, SchemaSnapshot, SchemaTable } from '#shared/types/db'

/** Runs a metadata query on the driver's connection. Errors are already normalised by the driver. */
export type QueryFn = <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>

/** Assembles the dialect-independent snapshot. */
export function snapshotOf(dialect: SchemaSnapshot['dialect'], schema: string, tables: SchemaTable[]): SchemaSnapshot {
  return { dialect, schema, tables, readAt: new Date().toISOString() }
}

/** Maps the lowercase referential action keywords; anything unknown becomes `no action`. */
export function referentialAction(raw: string | null | undefined): ReferentialAction {
  switch ((raw ?? '').toLowerCase()) {
    case 'cascade':
      return 'cascade'
    case 'restrict':
      return 'restrict'
    case 'set null':
      return 'set null'
    case 'set default':
      return 'set default'
    default:
      return 'no action'
  }
}

/** Parses `ENUM('a','b''c')` into its values. Returns null when the type is not an enum. */
export function parseEnumValues(nativeType: string): string[] | null {
  const match = /^enum\((.*)\)$/i.exec(nativeType.trim())
  if (!match) return null
  const values: string[] = []
  const re = /'((?:[^']|'')*)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(match[1]!)) !== null) values.push(m[1]!.replace(/''/g, "'"))
  return values
}

/** Groups rows by a key, keeping their order. */
export function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const row of rows) {
    const k = key(row)
    const bucket = out.get(k)
    if (bucket) bucket.push(row)
    else out.set(k, [row])
  }
  return out
}
