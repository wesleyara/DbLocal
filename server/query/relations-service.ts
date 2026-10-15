import type { Kysely } from 'kysely'
import type { RelationGraph, RelationRef, SchemaSnapshot, SchemaTable } from '#shared/types/db'
import type { CountRequest, CountResponse, FilterNode, GroupCountPlan, RelationScope, RowsPlan } from '#shared/types/rows'
import type { RecordKey, RecordResponse, RecordSummary, ResolvedRow, ResolveRequest, ResolveResponse } from '#shared/types/relations'
import type { Driver } from '../drivers'
import { connectionDriver, readSchema } from '../schema/service'
import type { StoreSchema } from '../store/db'
import { GROUP_COUNT } from './compile'
import { QueryInputError } from './errors'
import { findTable, planRows } from './plan'
import { serializeValue } from './serialize'

type Db = Kysely<StoreSchema>
type Row = Record<string, unknown>

const MAX_IN = 500

const fail = (status: 400 | 404, message: string) => new QueryInputError(status, message)

/** String form of a key value, so `1` and `"1"` (bigint ids come back as strings) compare equal. */
const norm = (v: unknown): string => String(serializeValue(v))
const tupleId = (values: unknown[]): string => values.map(norm).join('\u0001')

function requireKeyed(table: SchemaTable): void {
  if (table.primaryKey.length === 0 || table.implicitRowid) throw fail(400, `Table ${table.name} has no primary key`)
}

/** `column in (...)` for one column, or an OR of AND groups for a composite key. */
export function tupleFilter(columns: string[], tuples: unknown[][]): FilterNode {
  if (columns.length === 1) {
    return { type: 'condition', column: columns[0]!, op: 'in', value: tuples.map((t) => t[0]) as Array<string | number> }
  }
  return {
    type: 'group',
    logic: 'or',
    children: tuples.map((t) => ({
      type: 'group' as const,
      logic: 'and' as const,
      children: columns.map((column, i) => ({
        type: 'condition' as const,
        column,
        op: 'eq' as const,
        value: t[i] as string | number,
      })),
    })),
  }
}

/** Distinct tuples, dropping any with a null part (a null FK relates to nothing). */
function distinct(tuples: unknown[][]): unknown[][] {
  const seen = new Map<string, unknown[]>()
  for (const t of tuples) {
    if (t.some((v) => v === null || v === undefined)) continue
    seen.set(tupleId(t), t)
  }
  return [...seen.values()]
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function readPlan(snapshot: SchemaSnapshot, table: string, filter: FilterNode, columns: string[], limit: number): RowsPlan {
  return planRows(snapshot, table, { schema: snapshot.schema, filter, sort: [], columns, limit, offset: 0 })
}

function groupPlan(snapshot: SchemaSnapshot, table: string, groupBy: string[], filter: FilterNode): GroupCountPlan {
  const info = findTable(snapshot, table)
  for (const c of groupBy) if (!info.columns.some((col) => col.name === c)) throw fail(400, `Unknown column: ${c}`)
  return { dialect: snapshot.dialect, schema: snapshot.schema, table, groupBy, filter }
}

/** Junction columns that match this side of an N:N ref, in the order of `ref.columns`. */
function junctionColumns(graph: RelationGraph, ref: RelationRef): { table: string; columns: string[] } {
  const relation = graph.relations.find((r) => r.id === ref.relationId)
  if (!relation?.via) throw fail(400, `Relation ${ref.name} has no junction table`)
  const fromSide = ref.name === relation.name
  return { table: relation.via.table, columns: fromSide ? relation.via.fromColumns : relation.via.toColumns }
}

/** Relations of a table by name: outgoing (FK side, N:N) and incoming. */
export function refsOf(graph: RelationGraph, table: string): RelationRef[] {
  const entry = graph.tables[table]
  return entry ? [...entry.outgoing, ...entry.incoming] : []
}

const isParent = (ref: RelationRef, graph: RelationGraph, table: string): boolean =>
  ref.cardinality !== 'many-to-many' && !!graph.tables[table]?.outgoing.includes(ref)

/**
 * Resolves, for already-known rows of one table, the parent record of each N:1 / 1:1 relation and
 * the number of related records of each 1:N / N:N relation. One query per relation, whatever the
 * number of rows: `WHERE key IN (...)` for parents and `GROUP BY` for counts.
 */
export async function resolveRelations(
  driver: Driver,
  snapshot: SchemaSnapshot,
  graph: RelationGraph,
  tableName: string,
  req: Pick<ResolveRequest, 'rows' | 'relations'>,
): Promise<ResolveResponse> {
  const table = findTable(snapshot, tableName)
  requireKeyed(table)
  let refs = refsOf(graph, tableName)
  if (req.relations) {
    const wanted = new Set(req.relations)
    for (const name of wanted) if (!refs.some((r) => r.name === name)) throw fail(400, `Unknown relation: ${name}`)
    refs = refs.filter((r) => wanted.has(r.name))
  }

  const result: ResolvedRow[] = req.rows.map(() => ({ parents: {}, counts: {} }))
  if (refs.length === 0) return { rows: result }

  // Source columns each relation needs, read once for all rows.
  const pk = table.primaryKey
  for (const key of req.rows) {
    for (const c of pk) if (!(c in key)) throw fail(400, `Key is missing column ${c}`)
  }
  const needed = [...new Set([...pk, ...refs.flatMap((r) => r.columns)])]
  const sourceRows = new Map<string, Row>()
  const keyTuples = distinct(req.rows.map((k) => pk.map((c) => k[c])))
  for (const part of chunks(keyTuples, MAX_IN)) {
    const plan = readPlan(snapshot, tableName, tupleFilter(pk, part), needed, part.length)
    for (const row of await driver.readRows(plan)) sourceRows.set(tupleId(pk.map((c) => row[c])), row)
  }
  const sourceOf = (key: RecordKey): Row | undefined => sourceRows.get(tupleId(pk.map((c) => key[c])))

  for (const ref of refs) {
    const values = req.rows.map((key) => {
      const row = sourceOf(key)
      return row ? ref.columns.map((c) => row[c]) : null
    })
    const wanted = distinct(values.filter((v): v is unknown[] => v !== null))

    if (isParent(ref, graph, tableName)) {
      const found = await readSummaries(driver, snapshot, graph, ref.target, ref.targetColumns, wanted)
      req.rows.forEach((_, i) => {
        const v = values[i]
        result[i]!.parents[ref.name] = v && !v.some((x) => x === null || x === undefined) ? (found.get(tupleId(v)) ?? null) : null
      })
      continue
    }

    const counts = await readCounts(driver, snapshot, graph, ref, wanted)
    req.rows.forEach((_, i) => {
      const v = values[i]
      result[i]!.counts[ref.name] = v ? (counts.get(tupleId(v)) ?? 0) : 0
    })
  }
  return { rows: result }
}

/** Summaries (pk + display label) of target rows whose `matchColumns` equal one of the tuples. */
async function readSummaries(
  driver: Driver,
  snapshot: SchemaSnapshot,
  graph: RelationGraph,
  targetName: string,
  matchColumns: string[],
  tuples: unknown[][],
): Promise<Map<string, RecordSummary>> {
  const out = new Map<string, RecordSummary>()
  if (tuples.length === 0) return out
  const target = findTable(snapshot, targetName)
  const display = graph.tables[targetName]?.displayColumn ?? null
  const columns = [...new Set([...matchColumns, ...target.primaryKey, ...(display ? [display] : [])])]
  for (const part of chunks(tuples, MAX_IN)) {
    const plan = readPlan(snapshot, targetName, tupleFilter(matchColumns, part), columns, part.length)
    for (const row of await driver.readRows(plan)) {
      const key: RecordKey = {}
      for (const c of target.primaryKey) key[c] = serializeValue(row[c]) as string | number
      const label = display && row[display] !== null && row[display] !== undefined ? String(serializeValue(row[display])) : null
      out.set(tupleId(matchColumns.map((c) => row[c])), { key, label })
    }
  }
  return out
}

/** Related-record counts for one 1:N / N:N ref, by tuple of `ref.columns` values. */
async function readCounts(
  driver: Driver,
  snapshot: SchemaSnapshot,
  graph: RelationGraph,
  ref: RelationRef,
  tuples: unknown[][],
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (tuples.length === 0) return out
  const via = ref.via ? junctionColumns(graph, ref) : null
  const table = via ? via.table : ref.target
  const columns = via ? via.columns : ref.targetColumns
  for (const part of chunks(tuples, MAX_IN)) {
    const plan = groupPlan(snapshot, table, columns, tupleFilter(columns, part))
    for (const row of await driver.countGroups(plan)) out.set(tupleId(columns.map((c) => row[c])), Number(row[GROUP_COUNT] ?? 0))
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Scope: "rows related to this record", applied to row reads and counts.

export type ResolvedScope = { empty: true } | { empty: false; filter: FilterNode | null; junction: RowsPlan['junction'] }

/**
 * Turns a `RelationScope` into a filter on the target table (direct relations) or a junction
 * subquery (N:N). The origin row is read to get the values the relation joins on.
 */
export async function resolveScope(
  driver: Driver,
  snapshot: SchemaSnapshot,
  graph: RelationGraph,
  targetTable: string,
  scope: RelationScope,
): Promise<ResolvedScope> {
  const origin = findTable(snapshot, scope.table)
  requireKeyed(origin)
  const ref = refsOf(graph, scope.table).find((r) => r.name === scope.relation)
  if (!ref) throw fail(400, `Unknown relation: ${scope.relation}`)
  if (ref.target !== targetTable) throw fail(400, `Relation ${scope.relation} does not lead to ${targetTable}`)
  for (const c of origin.primaryKey) if (!(c in scope.key)) throw fail(400, `Key is missing column ${c}`)

  const keyFilter = tupleFilter(origin.primaryKey, [origin.primaryKey.map((c) => scope.key[c])])
  const [row] = await driver.readRows(readPlan(snapshot, scope.table, keyFilter, [...new Set(ref.columns)], 2))
  if (!row) throw fail(404, 'Record not found')
  const values = ref.columns.map((c) => row[c])
  if (values.some((v) => v === null || v === undefined)) return { empty: true }

  if (ref.via) {
    const via = junctionColumns(graph, ref)
    const other = graph.relations.find((r) => r.id === ref.relationId)!.via!
    const farColumns = via.columns === other.fromColumns ? other.toColumns : other.fromColumns
    return {
      empty: false,
      filter: null,
      junction: {
        columns: ref.targetColumns,
        table: via.table,
        selectColumns: farColumns,
        whereColumns: via.columns,
        values,
      },
    }
  }
  return { empty: false, filter: tupleFilter(ref.targetColumns, [values]), junction: null }
}

/** `and`s the scope filter onto the request filter. */
export function withFilter(base: FilterNode | null, extra: FilterNode | null): FilterNode | null {
  if (!extra) return base
  if (!base) return extra
  return { type: 'group', logic: 'and', children: [base, extra] }
}

// ---------------------------------------------------------------------------------------------
// Service entry points (store + pooled driver).

export async function resolveRelationsView(db: Db, connectionId: string, table: string, req: ResolveRequest): Promise<ResolveResponse> {
  const { snapshot, graph } = await readSchema(db, connectionId, req.schema)
  return resolveRelations(await connectionDriver(db, connectionId), snapshot, graph, table, req)
}

/** One record in full plus its resolved relations (for the record panel). */
export async function readRecord(db: Db, connectionId: string, table: string, schema: string, key: RecordKey): Promise<RecordResponse> {
  const { snapshot, graph } = await readSchema(db, connectionId, schema)
  const info = findTable(snapshot, table)
  requireKeyed(info)
  for (const c of info.primaryKey) if (!(c in key)) throw fail(400, `Key is missing column ${c}`)
  const driver = await connectionDriver(db, connectionId)
  const plan = planRows(snapshot, table, {
    schema,
    filter: tupleFilter(info.primaryKey, [info.primaryKey.map((c) => key[c])]),
    sort: [],
    limit: 2,
    offset: 0,
  })
  const [row] = await driver.readRows(plan)
  if (!row) throw fail(404, 'Record not found')
  const { rows } = await resolveRelations(driver, snapshot, graph, table, { rows: [key] })
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) out[k] = serializeValue(v)
  return { row: out, relations: rows[0]! }
}

export type { CountRequest, CountResponse }
