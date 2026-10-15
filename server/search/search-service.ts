import type { Kysely } from 'kysely'
import type { ColumnKind, SchemaColumn, SchemaTable } from '#shared/types/db'
import type { FilterCondition, FilterNode } from '#shared/types/rows'
import { DEFAULT_SEARCH_LIMIT, type SearchEvent, type SearchRequest } from '#shared/types/search'
import { connectionDriver, readSchema } from '../schema/service'
import type { StoreSchema } from '../store/db'
import { planRows } from '../query/plan'
import { serializeRow } from '../query/serialize'

type Db = Kysely<StoreSchema>

/** Tables searched at the same time. The search is expensive, so it never floods the pool. */
export const SEARCH_CONCURRENCY = 4
/** The filter AST allows 100 nodes; one is the group itself. */
const MAX_COLUMNS_PER_TABLE = 90

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMBER = /^-?\d+(\.\d+)?$/

/** The comparison that applies to a column for a term, or null when the column cannot match it. */
export function conditionFor(
  column: Pick<SchemaColumn, 'name' | 'kind'>,
  term: string,
  mode: 'exact' | 'contains',
): FilterCondition | null {
  const kind: ColumnKind = column.kind
  const make = (op: FilterCondition['op'], value: string | number): FilterCondition => ({
    type: 'condition',
    column: column.name,
    op,
    value,
  })
  switch (kind) {
    case 'string':
      return make(mode === 'exact' ? 'eq' : 'contains', term)
    case 'enum':
      return mode === 'exact' ? make('eq', term) : null
    case 'uuid':
      // `ilike` on a uuid column needs a cast on Postgres: only a whole uuid is compared.
      return UUID.test(term) ? make('eq', term.toLowerCase()) : null
    case 'number':
      return NUMBER.test(term) ? make('eq', Number(term)) : null
    default:
      return null
  }
}

/** Columns to compare plus the filter, or null when nothing in the table can match the term. */
export function planTableSearch(
  table: SchemaTable,
  term: string,
  mode: 'exact' | 'contains',
): { columns: string[]; filter: FilterNode } | null {
  const conditions: FilterCondition[] = []
  for (const column of table.columns) {
    const condition = conditionFor(column, term, mode)
    if (condition) conditions.push(condition)
    if (conditions.length >= MAX_COLUMNS_PER_TABLE) break
  }
  if (conditions.length === 0) return null
  return {
    columns: conditions.map((c) => c.column),
    filter: conditions.length === 1 ? conditions[0]! : { type: 'group', logic: 'or', children: conditions },
  }
}

/**
 * Searches a schema for a value, table by table, and reports each table as soon as it is done.
 * `signal` stops the search: tables not started are skipped and the stream ends with `cancelled`.
 */
export async function searchData(
  db: Db,
  connectionId: string,
  req: SearchRequest,
  emit: (event: SearchEvent) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  const { snapshot } = await readSchema(db, connectionId, req.schema)
  const driver = await connectionDriver(db, connectionId)
  const limit = req.limitPerTable ?? DEFAULT_SEARCH_LIMIT
  const wanted = req.tables ? new Set(req.tables) : null
  const candidates = snapshot.tables.filter((t) => !wanted || wanted.has(t.name))

  const queue: SchemaTable[] = []
  let skipped = 0
  for (const table of candidates) {
    if (planTableSearch(table, req.term, req.mode)) queue.push(table)
    else skipped++
  }
  await emit({ type: 'start', tables: queue.length })

  let searched = 0
  let cancelled = false
  const worker = async (): Promise<void> => {
    for (;;) {
      if (signal?.aborted) {
        cancelled = true
        return
      }
      const table = queue.shift()
      if (!table) return
      const match = planTableSearch(table, req.term, req.mode)!
      try {
        const columns = [...new Set([...table.primaryKey, ...match.columns])]
        const plan = planRows(snapshot, table.name, {
          schema: req.schema,
          filter: match.filter,
          sort: [],
          limit: limit + 1,
          offset: 0,
          columns,
        })
        const rows = await driver.readRows(plan)
        searched++
        if (signal?.aborted) {
          cancelled = true
          return
        }
        if (rows.length > 0) {
          await emit({
            type: 'table',
            table: table.name,
            columns: match.columns,
            primaryKey: table.primaryKey,
            rows: rows.slice(0, limit).map(serializeRow),
            truncated: rows.length > limit,
          })
        }
      } catch (err) {
        searched++
        await emit({ type: 'error', table: table.name, message: err instanceof Error ? err.message : String(err) })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(SEARCH_CONCURRENCY, queue.length) }, worker))
  skipped += queue.length
  await emit({ type: 'done', searched, skipped, cancelled: cancelled || !!signal?.aborted })
}
