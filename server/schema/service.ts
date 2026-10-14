import type { Kysely } from 'kysely'
import type { RelationGraph, SchemaSnapshot } from '#shared/types/db'
import { buildDriverConfig } from '../connections/config'
import { getConnection, loadDraft } from '../connections/repository'
import { createDriver, getPoolManager } from '../drivers'
import type { StoreSchema } from '../store/db'
import { buildRelationGraph } from './relation-graph'
import type { VirtualRelationInput } from '#shared/schemas/virtual-relation'
import { getDisplayOverrides, listVirtualRelations, validateVirtualRelation, type VirtualRelationIssue } from './virtual-relations'

type Db = Kysely<StoreSchema>

/**
 * Snapshots are cached per connection + schema. Virtual relations and display columns are not part
 * of the snapshot, so the graph is rebuilt on every read and those edits never need invalidation.
 */
const snapshots = new Map<string, SchemaSnapshot>()

const keyOf = (connectionId: string, schema: string) => `${connectionId}\u0000${schema}`

export interface SchemaView {
  snapshot: SchemaSnapshot
  graph: RelationGraph
  cached: boolean
}

/** Drops every cached snapshot of a connection. Called on refresh, and after DDL runs in the SQL editor. */
export function invalidateSchema(connectionId: string): void {
  for (const key of snapshots.keys()) {
    if (key.startsWith(`${connectionId}\u0000`)) snapshots.delete(key)
  }
}

/**
 * Returns the snapshot (introspected or cached) and the relation graph built from it plus the
 * connection's virtual relations and display overrides.
 */
export async function readSchema(
  db: Db,
  connectionId: string,
  requested: string | undefined,
  options: { refresh?: boolean } = {},
): Promise<SchemaView> {
  const view = await getConnection(db, connectionId)
  const schema = requested || defaultSchemaOf(view.dialect, view.defaultSchema, view.database)
  if (!schema) throw createError({ statusCode: 400, statusMessage: 'schema is required' })

  const key = keyOf(connectionId, schema)
  let snapshot = options.refresh ? undefined : snapshots.get(key)
  const cached = snapshot !== undefined
  if (!snapshot) {
    const config = buildDriverConfig(await loadDraft(db, connectionId), connectionId)
    const driver = await getPoolManager().get(config, createDriver)
    snapshot = await driver.introspect(schema)
    snapshots.set(key, snapshot)
  }

  const virtual = await listVirtualRelations(db, connectionId, schema)
  const overrides = await getDisplayOverrides(db, connectionId, schema)
  const graph = buildRelationGraph(snapshot, virtual, { displayOverrides: overrides })
  return { snapshot, graph, cached }
}

/** Loads the snapshot only (validation of virtual relations needs it, without the graph). */
export async function loadSnapshot(db: Db, connectionId: string, schema: string): Promise<SchemaSnapshot> {
  return (await readSchema(db, connectionId, schema)).snapshot
}

/** SQLite: `main`. MySQL: the connection's database. Postgres: the connection's default schema or `public`. */
export function defaultSchemaOf(dialect: string, defaultSchema: string | null, database: string | null): string {
  if (defaultSchema) return defaultSchema
  if (dialect === 'postgres') return 'public'
  if (dialect === 'sqlite') return 'main'
  return database ?? ''
}

/** Validates a virtual relation against the live snapshot and the connection's existing relations. */
export async function checkVirtualRelation(
  db: Db,
  connectionId: string,
  input: VirtualRelationInput,
  excludeId?: string,
): Promise<VirtualRelationIssue[]> {
  const snapshot = await loadSnapshot(db, connectionId, input.schema)
  const existing = await listVirtualRelations(db, connectionId, input.schema)
  return validateVirtualRelation(snapshot, input, existing, excludeId)
}
