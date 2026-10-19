import type { ColumnKind, SchemaColumn, SchemaForeignKey, SchemaIndex, SchemaSnapshot, SchemaTable } from '#shared/types/db'
import { groupBy, referentialAction, snapshotOf, type QueryFn } from './common'

interface TableRow {
  name: string
  relkind: string
  reltuples: number
  comment: string | null
}

interface ColumnRow {
  table_name: string
  name: string
  native_type: string
  base_name: string
  base_type: string
  is_array: boolean
  nullable: boolean
  default_expr: string | null
  identity: string
  generated: string
  comment: string | null
  enum_values: string[] | null
}

interface ConstraintRow {
  table_name: string
  name: string
  type: 'p' | 'f'
  columns: string[]
  ref_schema: string | null
  ref_table: string | null
  ref_columns: string[] | null
  on_delete: string
  on_update: string
}

interface IndexRow {
  table_name: string
  name: string
  is_unique: boolean
  is_primary: boolean
  columns: string[]
}

const TABLES_SQL = `
  SELECT c.relname AS name, c.relkind::text AS relkind, c.reltuples::float8 AS reltuples,
         obj_description(c.oid, 'pg_class') AS comment
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = $1 AND c.relkind IN ('r', 'p', 'v', 'm')
  ORDER BY c.relname`

const COLUMNS_SQL = `
  SELECT c.relname AS table_name, a.attname AS name,
         format_type(a.atttypid, a.atttypmod) AS native_type,
         bt.typname::text AS base_name, bt.typtype::text AS base_type,
         (t.typcategory = 'A') AS is_array,
         NOT a.attnotnull AS nullable,
         pg_get_expr(d.adbin, d.adrelid) AS default_expr,
         a.attidentity::text AS identity,
         a.attgenerated::text AS generated,
         col_description(c.oid, a.attnum) AS comment,
         CASE WHEN bt.typtype = 'e' THEN
           (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = bt.oid)
         END AS enum_values
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_type t ON t.oid = a.atttypid
  JOIN pg_type bt ON bt.oid = COALESCE(NULLIF(t.typbasetype, 0), t.oid)
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE n.nspname = $1 AND c.relkind IN ('r', 'p', 'v', 'm') AND a.attnum > 0 AND NOT a.attisdropped
  ORDER BY c.relname, a.attnum`

const CONSTRAINTS_SQL = `
  SELECT c.relname AS table_name, con.conname AS name, con.contype::text AS type,
         ARRAY(
           SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
           JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
           ORDER BY k.ord) AS columns,
         rn.nspname::text AS ref_schema, rc.relname::text AS ref_table,
         ARRAY(
           SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
           JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
           ORDER BY k.ord) AS ref_columns,
         con.confdeltype::text AS on_delete, con.confupdtype::text AS on_update
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_class rc ON rc.oid = con.confrelid
  LEFT JOIN pg_namespace rn ON rn.oid = rc.relnamespace
  WHERE n.nspname = $1 AND con.contype IN ('p', 'f')`

const INDEXES_SQL = `
  SELECT c.relname AS table_name, i.relname AS name, ix.indisunique AS is_unique,
         ix.indisprimary AS is_primary,
         ARRAY(
           SELECT a.attname::text FROM unnest(ix.indkey::int2[]) WITH ORDINALITY k(attnum, ord)
           JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
           ORDER BY k.ord) AS columns
  FROM pg_index ix
  JOIN pg_class i ON i.oid = ix.indexrelid
  JOIN pg_class c ON c.oid = ix.indrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = $1`

const PG_KIND: Record<string, ColumnKind> = {
  int2: 'number',
  int4: 'number',
  int8: 'number',
  float4: 'number',
  float8: 'number',
  numeric: 'number',
  money: 'number',
  oid: 'number',
  bool: 'boolean',
  text: 'string',
  varchar: 'string',
  bpchar: 'string',
  char: 'string',
  name: 'string',
  citext: 'string',
  date: 'date',
  timestamp: 'datetime',
  timestamptz: 'datetime',
  time: 'time',
  timetz: 'time',
  interval: 'time',
  json: 'json',
  jsonb: 'json',
  uuid: 'uuid',
  bytea: 'binary',
}

/** Normalised kind of a Postgres column from its base type (domains already resolved). */
export function pgKind(row: Pick<ColumnRow, 'base_name' | 'base_type' | 'is_array'>): ColumnKind {
  if (row.is_array) return 'array'
  if (row.base_type === 'e') return 'enum'
  return PG_KIND[row.base_name] ?? 'other'
}

export async function introspectPostgres(query: QueryFn, schema: string): Promise<SchemaSnapshot> {
  const [tables, columns, constraints, indexes] = await Promise.all([
    query<TableRow>(TABLES_SQL, [schema]),
    query<ColumnRow>(COLUMNS_SQL, [schema]),
    query<ConstraintRow>(CONSTRAINTS_SQL, [schema]),
    query<IndexRow>(INDEXES_SQL, [schema]),
  ])

  const columnsBy = groupBy(columns, (c) => c.table_name)
  const constraintsBy = groupBy(constraints, (c) => c.table_name)
  const indexesBy = groupBy(indexes, (i) => i.table_name)

  const out: SchemaTable[] = tables.map((t) => {
    const cons = constraintsBy.get(t.name) ?? []
    const pk = cons.find((c) => c.type === 'p')?.columns ?? []
    const cols: SchemaColumn[] = (columnsBy.get(t.name) ?? []).map((c) => ({
      name: c.name,
      nativeType: c.native_type,
      kind: pgKind(c),
      nullable: c.nullable,
      default: c.default_expr,
      isGenerated: c.identity !== '' || c.generated !== '',
      identity: c.identity === 'd' && c.generated === '',
      isPrimaryKey: pk.includes(c.name),
      comment: c.comment,
      enumValues: c.enum_values ?? null,
    }))
    const foreignKeys: SchemaForeignKey[] = cons
      .filter((c) => c.type === 'f')
      .map((c) => ({
        name: c.name,
        columns: c.columns,
        refSchema: c.ref_schema,
        refTable: c.ref_table ?? '',
        refColumns: c.ref_columns ?? [],
        onDelete: referentialAction(PG_ACTIONS[c.on_delete]),
        onUpdate: referentialAction(PG_ACTIONS[c.on_update]),
      }))
    const indexList: SchemaIndex[] = (indexesBy.get(t.name) ?? []).map((i) => ({
      name: i.name,
      columns: i.columns,
      unique: i.is_unique,
      primary: i.is_primary,
    }))
    return {
      name: t.name,
      kind: t.relkind === 'v' ? 'view' : t.relkind === 'm' ? 'materialized_view' : 'table',
      columns: cols,
      primaryKey: pk,
      foreignKeys,
      indexes: indexList,
      implicitRowid: false,
      rowEstimate: t.reltuples >= 0 ? Math.round(t.reltuples) : null,
      comment: t.comment,
    }
  })
  return snapshotOf('postgres', schema, out)
}

/** `pg_constraint` action codes: a no action, r restrict, c cascade, n set null, d set default. */
const PG_ACTIONS: Record<string, string> = {
  a: 'no action',
  r: 'restrict',
  c: 'cascade',
  n: 'set null',
  d: 'set default',
}
