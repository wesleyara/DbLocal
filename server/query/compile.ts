import {
  DummyDriver,
  Kysely,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  sql,
  type CompiledQuery,
  type Dialect,
  type Expression,
  type RawBuilder,
  type SqlBool,
} from 'kysely'
import type { FilterCondition, FilterNode, GroupCountPlan, JunctionScope, RowsPlan } from '#shared/types/rows'

type Db = Record<string, Record<string, unknown>>
type Dialects = RowsPlan['dialect']

/**
 * A Kysely instance that only compiles: it never touches a pool. Each driver executes the compiled
 * SQL on its own connection, so Kysely does not own any connection.
 */
function compileOnly(dialect: Dialects): Kysely<Db> {
  const built: Dialect =
    dialect === 'postgres'
      ? {
          createAdapter: () => new PostgresAdapter(),
          createDriver: () => new DummyDriver(),
          createIntrospector: (db) => new PostgresIntrospector(db),
          createQueryCompiler: () => new PostgresQueryCompiler(),
        }
      : dialect === 'mysql'
        ? {
            createAdapter: () => new MysqlAdapter(),
            createDriver: () => new DummyDriver(),
            createIntrospector: (db) => new MysqlIntrospector(db),
            createQueryCompiler: () => new MysqlQueryCompiler(),
          }
        : {
            createAdapter: () => new SqliteAdapter(),
            createDriver: () => new DummyDriver(),
            createIntrospector: (db) => new SqliteIntrospector(db),
            createQueryCompiler: () => new SqliteQueryCompiler(),
          }
  return new Kysely<Db>({ dialect: built })
}

const builders: Record<Dialects, Kysely<Db>> = {
  postgres: compileOnly('postgres'),
  mysql: compileOnly('mysql'),
  sqlite: compileOnly('sqlite'),
}

/** The compile-only Kysely of a dialect, for the other compilers (mutations) that build raw SQL. */
export function builderFor(dialect: Dialects): Kysely<Db> {
  return builders[dialect]
}

/** LIKE wildcards in user text are escaped with `!`, which every dialect accepts via `ESCAPE '!'`. */
export function escapeLike(text: string): string {
  return text.replace(/[!%_]/g, (ch) => `!${ch}`)
}

function conditionSql(c: FilterCondition, dialect: Dialects): RawBuilder<SqlBool> {
  const col = sql.id(c.column)
  const v = c.value
  switch (c.op) {
    case 'eq':
      return sql<SqlBool>`${col} = ${v}`
    case 'neq':
      return sql<SqlBool>`${col} <> ${v}`
    case 'gt':
      return sql<SqlBool>`${col} > ${v}`
    case 'gte':
      return sql<SqlBool>`${col} >= ${v}`
    case 'lt':
      return sql<SqlBool>`${col} < ${v}`
    case 'lte':
      return sql<SqlBool>`${col} <= ${v}`
    case 'contains':
      return like(col, `%${escapeLike(String(v))}%`, dialect)
    case 'starts_with':
      return like(col, `${escapeLike(String(v))}%`, dialect)
    case 'ends_with':
      return like(col, `%${escapeLike(String(v))}`, dialect)
    case 'in':
      return sql<SqlBool>`${col} in (${sql.join(v as unknown[])})`
    case 'not_in':
      return sql<SqlBool>`${col} not in (${sql.join(v as unknown[])})`
    case 'is_null':
      return sql<SqlBool>`${col} is null`
    case 'is_not_null':
      return sql<SqlBool>`${col} is not null`
    case 'between': {
      const [from, to] = v as [unknown, unknown]
      return sql<SqlBool>`${col} between ${from} and ${to}`
    }
    case 'is_true':
      return sql<SqlBool>`${col} = ${true}`
    case 'is_false':
      return sql<SqlBool>`${col} = ${false}`
  }
}

/** Case-insensitive LIKE: ILIKE on Postgres, LOWER on both sides elsewhere. */
function like(col: RawBuilder<unknown>, pattern: string, dialect: Dialects): RawBuilder<SqlBool> {
  if (dialect === 'postgres') return sql<SqlBool>`${col} ilike ${pattern} escape '!'`
  return sql<SqlBool>`lower(${col}) like lower(${pattern}) escape '!'`
}

/** Returns null for an empty group, which then adds no condition. */
function filterSql(node: FilterNode, dialect: Dialects): RawBuilder<SqlBool> | null {
  if (node.type === 'condition') return conditionSql(node, dialect)
  const parts = node.children.map((child) => filterSql(child, dialect)).filter((p): p is RawBuilder<SqlBool> => p !== null)
  if (parts.length === 0) return null
  const glue = sql.raw(node.logic === 'and' ? ' and ' : ' or ')
  return sql<SqlBool>`(${sql.join(parts as Expression<SqlBool>[], glue)})`
}

function junctionSql(j: JunctionScope, plan: RowsPlan): RawBuilder<SqlBool> {
  const ids = (cols: string[]) => sql.join(cols.map((c) => sql.id(c)))
  const conds = j.whereColumns.map((c, i) => sql<SqlBool>`${sql.id(c)} = ${j.values[i]}`)
  return sql<SqlBool>`(${ids(j.columns)}) in (select ${ids(j.selectColumns)} from ${sql.id(plan.schema, j.table)} where ${sql.join(
    conds as Expression<SqlBool>[],
    sql.raw(' and '),
  )})`
}

function base(plan: RowsPlan) {
  return builders[plan.dialect].withSchema(plan.schema).selectFrom(plan.table)
}

/** `SELECT <columns> FROM schema.table WHERE <filter> ORDER BY <sort> LIMIT n OFFSET m`, parameterised. */
export function compileRows(plan: RowsPlan): CompiledQuery {
  const from = base(plan)
  let query = plan.columns ? from.select(plan.columns.map((c) => sql.id(c).as(c))) : from.selectAll()
  const filter = plan.filter ? filterSql(plan.filter, plan.dialect) : null
  if (filter) query = query.where(filter)
  if (plan.junction) query = query.where(junctionSql(plan.junction, plan))
  for (const item of plan.sort) query = query.orderBy(sql.id(item.column), item.direction)
  return query.limit(plan.limit).offset(plan.offset).compile()
}

/** `SELECT count(*) FROM schema.table WHERE <filter>`, parameterised. */
export function compileCount(plan: RowsPlan): CompiledQuery {
  let query = base(plan).select(sql<number>`count(*)`.as('count'))
  const filter = plan.filter ? filterSql(plan.filter, plan.dialect) : null
  if (filter) query = query.where(filter)
  if (plan.junction) query = query.where(junctionSql(plan.junction, plan))
  return query.compile()
}

/** Alias of the count column in `compileGroupCount` results. */
export const GROUP_COUNT = '__count'

/** `SELECT g1, g2, count(*) FROM schema.table WHERE <filter> GROUP BY g1, g2`, parameterised. */
export function compileGroupCount(plan: GroupCountPlan): CompiledQuery {
  const cols = plan.groupBy.map((c) => sql.id(c))
  let query = builders[plan.dialect]
    .withSchema(plan.schema)
    .selectFrom(plan.table)
    .select([...plan.groupBy.map((c) => sql.id(c).as(c)), sql<number>`count(*)`.as(GROUP_COUNT)])
  const filter = plan.filter ? filterSql(plan.filter, plan.dialect) : null
  if (filter) query = query.where(filter)
  return query.groupBy(cols).compile()
}
