import type { Kysely } from 'kysely'
import {
  EXACT_COUNT_THRESHOLD,
  type BlobRequest,
  type CountRequest,
  type CountResponse,
  type RowsRequest,
  type RowsResponse,
} from '#shared/types/rows'
import { connectionDriver, readSchema } from '../schema/service'
import type { StoreSchema } from '../store/db'
import { QueryInputError } from './errors'
import { findTable, planRows } from './plan'
import { serializeRow } from './serialize'

type Db = Kysely<StoreSchema>

/** One page of rows of a table, with the filter and sort applied on the server. */
export async function readRowsPage(db: Db, connectionId: string, table: string, req: RowsRequest): Promise<RowsResponse> {
  const { snapshot } = await readSchema(db, connectionId, req.schema)
  const plan = planRows(snapshot, table, req)
  const rows = await (await connectionDriver(db, connectionId)).readRows(plan)
  return { rows: rows.map(serializeRow) }
}

/**
 * Row count. Without a filter, a large table (estimate above the threshold) returns the catalogue
 * estimate unless `exact` is requested. Filtered counts are always exact.
 */
export async function countRowsView(db: Db, connectionId: string, table: string, req: CountRequest): Promise<CountResponse> {
  const { snapshot } = await readSchema(db, connectionId, req.schema)
  const info = findTable(snapshot, table)
  const estimate = info.rowEstimate
  if (!req.exact && req.filter === null && estimate !== null && estimate > EXACT_COUNT_THRESHOLD) {
    return { count: estimate, exact: false }
  }
  const plan = planRows(snapshot, table, { schema: req.schema, filter: req.filter, sort: [], limit: 1, offset: 0 })
  const count = await (await connectionDriver(db, connectionId)).countRows(plan)
  return { count, exact: true }
}

/** Largest binary value the grid lets the user download. */
export const MAX_BLOB_BYTES = 50 * 1024 * 1024

/**
 * The full bytes of one binary cell. The row is found by the key columns (its primary key), which
 * must match exactly one row. Not a preview: this is the value as stored.
 */
export async function readBlob(
  db: Db,
  connectionId: string,
  table: string,
  req: BlobRequest,
): Promise<{ bytes: Uint8Array; name: string }> {
  const { snapshot } = await readSchema(db, connectionId, req.schema)
  const info = findTable(snapshot, table)
  const column = info.columns.find((c) => c.name === req.column)
  if (!column || column.kind !== 'binary') throw new QueryInputError(400, 'Column is not binary')
  const conditions = Object.entries(req.key).map(([name, value]) => ({
    type: 'condition' as const,
    column: name,
    op: 'eq' as const,
    value,
  }))
  const plan = planRows(snapshot, table, {
    schema: req.schema,
    filter: conditions.length === 1 ? conditions[0]! : { type: 'group', logic: 'and', children: conditions },
    sort: [],
    columns: [req.column],
    limit: 2,
    offset: 0,
  })
  const rows = await (await connectionDriver(db, connectionId)).readRows(plan)
  if (rows.length !== 1) throw new QueryInputError(404, 'Row not found')
  const value = rows[0]![req.column]
  if (!(value instanceof Uint8Array)) throw new QueryInputError(404, 'No binary value')
  if (value.byteLength > MAX_BLOB_BYTES) throw new QueryInputError(400, 'Value is too large to download')
  return { bytes: value, name: `${table}-${req.column}.bin` }
}
