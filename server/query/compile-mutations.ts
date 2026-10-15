import { sql, type CompiledQuery, type Expression, type RawBuilder } from 'kysely'
import type { MutationPlan, MutationStatement, PlannedOp } from '#shared/types/mutations'
import type { RowsPlan } from '#shared/types/rows'
import { builderFor } from './compile'
import { DEFAULT_MARK, INCREMENT_MARK } from './mutation-plan'

type Dialect = MutationPlan['dialect']

export interface CompiledMutation extends CompiledQuery {
  /** True when the statement ends in `RETURNING *` (Postgres, SQLite). MySQL re-selects instead. */
  returning: boolean
}

const supportsReturning = (dialect: Dialect) => dialect !== 'mysql'

function where(columns: string[], values: Record<string, unknown>): RawBuilder<unknown> {
  const parts = columns.map((c) => sql`${sql.id(c)} = ${values[c]}`)
  return sql.join(parts as Expression<unknown>[], sql` and `)
}

/**
 * `increment()`: the maximum of the column plus one. The derived table keeps MySQL from refusing a
 * subquery on the table being written (error 1093).
 */
function nextValue(table: RawBuilder<unknown>, column: string): RawBuilder<unknown> {
  return sql`(select next_value from (select coalesce(max(${sql.id(column)}), 0) + 1 as next_value from ${table}) as dbl_increment)`
}

/**
 * Compiles one planned operation to parameterised SQL. Identifiers are quoted by Kysely, values
 * are always parameters. `DEFAULT` columns are left out of inserts (every dialect then applies the
 * default) and written as the `default` keyword in updates.
 */
export function compileMutation(op: PlannedOp, dialect: Dialect, schema: string): CompiledMutation {
  const table = sql.id(schema, op.table)
  const returning = supportsReturning(dialect) && op.type !== 'delete'
  const tail = returning ? sql` returning *` : sql``
  let statement: RawBuilder<unknown>

  switch (op.type) {
    case 'insert': {
      const entries = Object.entries(op.values).filter(([, v]) => v !== DEFAULT_MARK)
      if (entries.length === 0) {
        statement = dialect === 'mysql' ? sql`insert into ${table} () values ()` : sql`insert into ${table} default values`
      } else {
        const cols = sql.join(entries.map(([c]) => sql.id(c)))
        const vals = sql.join(entries.map(([c, v]) => (v === INCREMENT_MARK ? nextValue(table, c) : v)))
        statement = sql`insert into ${table} (${cols}) values (${vals})`
      }
      break
    }
    case 'update': {
      const sets = Object.entries(op.values).map(([c, v]) =>
        v === DEFAULT_MARK
          ? sql`${sql.id(c)} = default`
          : v === INCREMENT_MARK
            ? sql`${sql.id(c)} = ${nextValue(table, c)}`
            : sql`${sql.id(c)} = ${v}`,
      )
      statement = sql`update ${table} set ${sql.join(sets as Expression<unknown>[])} where ${where(op.keyColumns, op.pk)}`
      break
    }
    case 'delete':
      statement = sql`delete from ${table} where ${where(op.keyColumns, op.pk)}`
      break
  }

  const compiled = sql`${statement}${tail}`.compile(builderFor(dialect))
  return { ...compiled, returning }
}

/** Single-row read by key, used after a write on MySQL (no `RETURNING`). Built as a normal rows plan. */
export function reselectPlan(dialect: Dialect, schema: string, table: string, keyColumns: string[], key: Record<string, unknown>): RowsPlan {
  const conditions = keyColumns.map((column) => ({
    type: 'condition' as const,
    column,
    op: 'eq' as const,
    value: key[column] as string | number,
  }))
  return {
    dialect,
    schema,
    table,
    primaryKey: keyColumns,
    columns: null,
    filter: conditions.length === 1 ? conditions[0]! : { type: 'group', logic: 'and', children: conditions },
    sort: [],
    limit: 1,
    offset: 0,
  }
}

function literal(value: unknown, dialect: Dialect): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return dialect === 'sqlite' ? (value ? '1' : '0') : value ? 'TRUE' : 'FALSE'
  if (value instanceof Uint8Array) {
    if (value.byteLength > 64) return `'<binary ${value.byteLength} bytes>'`
    const hex = Buffer.from(value).toString('hex')
    return dialect === 'postgres' ? `'\\x${hex}'` : `X'${hex}'`
  }
  if (Array.isArray(value)) return `'{${value.map((v) => String(v)).join(',')}}'`
  return `'${String(value).replace(/'/g, "''")}'`
}

/** Parameter shown in the preview list: bytes become a size marker, not a megabyte of hex. */
function displayParameter(value: unknown): unknown {
  if (value instanceof Uint8Array) return `<binary ${value.byteLength} bytes>`
  return value
}

function inline(text: string, params: readonly unknown[], dialect: Dialect): string {
  if (dialect === 'postgres') return text.replace(/\$(\d+)/g, (_, n: string) => literal(params[Number(n) - 1], dialect))
  let i = 0
  return text.replace(/\?/g, () => literal(params[i++], dialect))
}

/** The statements of a plan as shown by "Preview SQL". Nothing is executed. */
export function previewStatements(plan: MutationPlan): MutationStatement[] {
  return plan.ops.map((op) => {
    const compiled = compileMutation(op, plan.dialect, plan.schema)
    const preview = inline(compiled.sql, compiled.parameters, plan.dialect)
    return {
      index: op.index,
      sql: compiled.sql,
      parameters: compiled.parameters.map(displayParameter),
      preview,
    }
  })
}
