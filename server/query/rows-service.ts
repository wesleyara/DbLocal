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
import { compileRows } from './compile'
import { inline } from './compile-mutations'
import { findTable, planRows } from './plan'
import { resolveScope, withFilter } from './relations-service'
import { serializeRow } from './serialize'

type Db = Kysely<StoreSchema>

/** One page of rows of a table, with the filter and sort applied on the server. */
export async function readRowsPage(db: Db, connectionId: string, table: string, req: RowsRequest): Promise<RowsResponse> {
  const { snapshot, graph } = await readSchema(db, connectionId, req.schema)
  const driver = await connectionDriver(db, connectionId)
  let request: RowsRequest = req
  let junction = null
  if (req.scope) {
    const scope = await resolveScope(driver, snapshot, graph, table, req.scope)
    if (scope.empty) return { rows: [] }
    request = { ...req, filter: withFilter(req.filter, scope.filter) }
    junction = scope.junction
  }
  const plan = { ...planRows(snapshot, table, request), junction }
  const rows = await driver.readRows(plan)
  return { rows: rows.map(serializeRow) }
}

/**
 * The SELECT the grid runs for a request, with the parameters written into the text. For display
 * and for opening the view in the SQL editor: it is never executed in this form.
 */
export async function previewRowsSql(db: Db, connectionId: string, table: string, req: RowsRequest): Promise<{ sql: string }> {
  const { snapshot, graph } = await readSchema(db, connectionId, req.schema)
  const driver = await connectionDriver(db, connectionId)
  let request: RowsRequest = req
  let junction = null
  if (req.scope) {
    const scope = await resolveScope(driver, snapshot, graph, table, req.scope)
    if (scope.empty) return { sql: '-- the related record does not exist: no rows' }
    request = { ...req, filter: withFilter(req.filter, scope.filter) }
    junction = scope.junction
  }
  const plan = { ...planRows(snapshot, table, request), junction }
  const compiled = compileRows(plan)
  return { sql: `${inline(compiled.sql, compiled.parameters, plan.dialect)};` }
}

/**
 * Row count. Without a filter, a large table (estimate above the threshold) returns the catalogue
 * estimate unless `exact` is requested. Filtered counts are always exact.
 */
export async function countRowsView(db: Db, connectionId: string, table: string, req: CountRequest): Promise<CountResponse> {
  const { snapshot, graph } = await readSchema(db, connectionId, req.schema)
  const info = findTable(snapshot, table)
  const driver = await connectionDriver(db, connectionId)
  let filter = req.filter
  let junction = null
  if (req.scope) {
    const scope = await resolveScope(driver, snapshot, graph, table, req.scope)
    if (scope.empty) return { count: 0, exact: true }
    filter = withFilter(filter, scope.filter)
    junction = scope.junction
  }
  const estimate = info.rowEstimate
  if (!req.exact && filter === null && !junction && estimate !== null && estimate > EXACT_COUNT_THRESHOLD) {
    return { count: estimate, exact: false }
  }
  const plan = { ...planRows(snapshot, table, { schema: req.schema, filter, sort: [], limit: 1, offset: 0 }), junction }
  const count = await driver.countRows(plan)
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
