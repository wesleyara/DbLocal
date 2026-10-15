import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import type { Kysely } from 'kysely'
import type { ConnectionView } from '#shared/types/connection'
import { createDemoConnection, findDemoConnection } from '../connections/repository'
import type { StoreSchema } from '../store/db'
import { createVirtualRelation, listVirtualRelations } from '../schema/virtual-relations'

type Db = Kysely<StoreSchema>

export const DEMO_FILE = 'demo.sqlite'
export const DEMO_NAME = 'Demo database'
const DEMO_SCHEMA = 'main'

/**
 * The example virtual relation: `audit_logs` has no foreign key on purpose, `entity_id` points at
 * a user when `entity_type` is `user`. Seeds the "virtual relations" part of the tour.
 */
export const DEMO_VIRTUAL_RELATION = {
  schema: DEMO_SCHEMA,
  name: 'audit_logs.user',
  fromTable: 'audit_logs',
  fromColumns: ['entity_id'],
  toTable: 'users',
  toColumns: ['id'],
  cardinality: 'many-to-one' as const,
}

export const demoFilePath = (dataDir: string) => join(dataDir, DEMO_FILE)

/** Builds the demo SQLite file from the relational seed (the same model as the dev databases). */
export function writeDemoFile(file: string, seedSql: string): void {
  mkdirSync(dirname(file), { recursive: true })
  for (const suffix of ['', '-wal', '-shm', '-journal']) rmSync(`${file}${suffix}`, { force: true })
  const db = new Database(file)
  try {
    db.exec(seedSql)
    // The seed's helper table is only needed while generating.
    db.exec('DROP TABLE IF EXISTS _seq')
    db.exec('VACUUM')
  } finally {
    db.close()
  }
}

async function ensureVirtualRelation(db: Db, connectionId: string): Promise<void> {
  const existing = await listVirtualRelations(db, connectionId, DEMO_SCHEMA)
  if (existing.some((r) => r.fromTable === 'audit_logs' && r.fromColumns.join() === 'entity_id')) return
  await createVirtualRelation(db, connectionId, DEMO_VIRTUAL_RELATION)
}

export interface DemoDeps {
  db: Db
  dataDir: string
  /** The seed SQL, read by the caller (bundled server asset, or the fixture in tests). */
  seedSql: () => Promise<string>
  /** Called before the file is replaced, to close pools and drop cached schemas. */
  release: (connectionId: string) => Promise<void>
}

/**
 * Opens the demo database: copies it into the data dir on first use (or when the file is gone),
 * creates the flagged connection and its example virtual relation. `reset` recreates the file
 * from the seed, discarding every edit. It never touches a database of the user.
 */
export async function openDemo(deps: DemoDeps, options: { reset?: boolean } = {}): Promise<ConnectionView> {
  const file = demoFilePath(deps.dataDir)
  let connection = await findDemoConnection(deps.db)
  const missing = !existsSync(file)
  if (options.reset || missing) {
    if (connection) await deps.release(connection.id)
    writeDemoFile(file, await deps.seedSql())
  }
  if (!connection) connection = await createDemoConnection(deps.db, file, DEMO_NAME)
  await ensureVirtualRelation(deps.db, connection.id)
  return connection
}
