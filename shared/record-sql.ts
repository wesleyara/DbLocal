type Dialect = 'postgres' | 'mysql' | 'sqlite'

const quote = (name: string, dialect: Dialect): string =>
  dialect === 'mysql' ? `\`${name.replace(/`/g, '``')}\`` : `"${name.replace(/"/g, '""')}"`

function literal(value: unknown, dialect: Dialect): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return dialect === 'sqlite' ? (value ? '1' : '0') : value ? 'TRUE' : 'FALSE'
  if (typeof value === 'object' && value !== null && '$binary' in value) return 'NULL'
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  const escaped = text.replace(/'/g, "''")
  return dialect === 'mysql' ? `'${escaped.replace(/\\/g, '\\\\')}'` : `'${escaped}'`
}

/** `INSERT INTO "schema"."table" (...) VALUES (...)` for one record. Binary values become NULL. */
export function recordAsInsert(
  dialect: Dialect,
  schema: string,
  table: string,
  row: Record<string, unknown>,
  generated: string[] = [],
): string {
  const names = Object.keys(row).filter((n) => !generated.includes(n))
  const target = dialect === 'sqlite' ? quote(table, dialect) : `${quote(schema, dialect)}.${quote(table, dialect)}`
  const cols = names.map((n) => quote(n, dialect)).join(', ')
  const values = names.map((n) => literal(row[n], dialect)).join(', ')
  return `INSERT INTO ${target} (${cols}) VALUES (${values});`
}
