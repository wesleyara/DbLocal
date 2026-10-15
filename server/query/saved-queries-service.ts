import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import {
  DEFAULT_HISTORY_RETENTION,
  type HistoryEntry,
  type HistoryPage,
  type HistoryQuery,
  type SavedQuery,
  type SavedQueryInput,
  type SavedQueryPatch,
} from '#shared/types/saved-queries'
import type { StoreSchema } from '../store/db'
import { QueryInputError } from './errors'

type Db = Kysely<StoreSchema>

const RETENTION_KEY = 'history-retention'

const toSaved = (r: StoreSchema['saved_queries']): SavedQuery => ({
  id: r.id,
  connectionId: r.connection_id,
  name: r.name,
  sql: r.sql,
  folder: r.folder,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

/** Saved queries, the ones of a connection plus the global ones (no connection). */
export async function listSavedQueries(db: Db, connectionId?: string): Promise<SavedQuery[]> {
  let q = db.selectFrom('saved_queries').selectAll()
  if (connectionId) q = q.where((eb) => eb.or([eb('connection_id', '=', connectionId), eb('connection_id', 'is', null)]))
  const rows = await q.orderBy('updated_at', 'desc').execute()
  return rows.map(toSaved)
}

export async function createSavedQuery(db: Db, input: SavedQueryInput): Promise<SavedQuery> {
  const now = new Date().toISOString()
  const row = {
    id: randomUUID(),
    connection_id: input.connectionId ?? null,
    name: input.name,
    sql: input.sql,
    folder: input.folder || null,
    created_at: now,
    updated_at: now,
  }
  if (row.connection_id) await assertConnection(db, row.connection_id)
  await db.insertInto('saved_queries').values(row).execute()
  return toSaved(row)
}

export async function updateSavedQuery(db: Db, id: string, patch: SavedQueryPatch): Promise<SavedQuery> {
  const values: Partial<StoreSchema['saved_queries']> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) values.name = patch.name
  if (patch.sql !== undefined) values.sql = patch.sql
  if (patch.folder !== undefined) values.folder = patch.folder || null
  if (patch.connectionId !== undefined) {
    if (patch.connectionId) await assertConnection(db, patch.connectionId)
    values.connection_id = patch.connectionId
  }
  const res = await db.updateTable('saved_queries').set(values).where('id', '=', id).executeTakeFirst()
  if (Number(res.numUpdatedRows) === 0) throw new QueryInputError(404, 'Saved query not found')
  const row = await db.selectFrom('saved_queries').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
  return toSaved(row)
}

export async function deleteSavedQuery(db: Db, id: string): Promise<void> {
  const res = await db.deleteFrom('saved_queries').where('id', '=', id).executeTakeFirst()
  if (Number(res.numDeletedRows) === 0) throw new QueryInputError(404, 'Saved query not found')
}

async function assertConnection(db: Db, id: string): Promise<void> {
  const row = await db.selectFrom('connections').select('id').where('id', '=', id).executeTakeFirst()
  if (!row) throw new QueryInputError(404, 'Connection not found')
}

/** `%` and `_` in a LIKE pattern typed by the user match themselves. */
const likePattern = (text: string): string => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

export async function listHistory(db: Db, query: HistoryQuery): Promise<HistoryPage> {
  let base = db.selectFrom('query_history')
  if (query.connectionId) base = base.where('connection_id', '=', query.connectionId)
  if (query.status) base = base.where('status', '=', query.status)
  if (query.q) base = base.where(sql<boolean>`sql like ${likePattern(query.q)} escape '\\'`)
  const total = await base.select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirstOrThrow()
  const rows = await base
    .selectAll()
    .orderBy('executed_at', 'desc')
    .orderBy('id', 'desc')
    .limit(query.limit ?? 50)
    .offset(query.offset ?? 0)
    .execute()
  const entries: HistoryEntry[] = rows.map((r) => ({
    id: r.id,
    connectionId: r.connection_id,
    sql: r.sql,
    durationMs: r.duration_ms,
    rowCount: r.row_count,
    status: r.status,
    error: r.error,
    executedAt: r.executed_at,
  }))
  return { entries, total: Number(total.n) }
}

/** Deletes the history of one connection, or all of it. Returns how many entries went away. */
export async function clearHistory(db: Db, connectionId?: string): Promise<number> {
  let q = db.deleteFrom('query_history')
  if (connectionId) q = q.where('connection_id', '=', connectionId)
  const res = await q.executeTakeFirst()
  return Number(res.numDeletedRows)
}

export async function getHistoryRetention(db: Db): Promise<number> {
  const row = await db.selectFrom('preferences').select('value').where('key', '=', RETENTION_KEY).executeTakeFirst()
  const n = row ? Number(row.value) : NaN
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_HISTORY_RETENTION
}

export async function setHistoryRetention(db: Db, value: number): Promise<number> {
  await db
    .insertInto('preferences')
    .values({ key: RETENTION_KEY, value: String(value) })
    .onConflict((oc) => oc.column('key').doUpdateSet({ value: String(value) }))
    .execute()
  await pruneHistory(db, value)
  return value
}

/** Keeps the newest `keep` entries. */
export async function pruneHistory(db: Db, keep: number): Promise<void> {
  await db
    .deleteFrom('query_history')
    .where('id', 'in', (eb) =>
      eb.selectFrom('query_history').select('id').orderBy('id', 'desc').limit(-1).offset(keep),
    )
    .execute()
}
