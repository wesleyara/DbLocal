import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { Migrator, type MigrationProvider } from 'kysely/migration'
import { join } from 'node:path'
import * as m001 from './migrations/001_initial'
import * as m002 from './migrations/002_connection_meta'

export interface StoreSchema {
  connections: {
    id: string
    name: string
    dialect: 'postgres' | 'mysql' | 'sqlite'
    config: string
    environment: 'local' | 'staging' | 'prod'
    color: string | null
    readonly: number
    default_schema: string | null
    last_used_at: string | null
    created_at: string
    updated_at: string
  }
  saved_queries: {
    id: string
    connection_id: string | null
    name: string
    sql: string
    created_at: string
    updated_at: string
  }
  query_history: {
    id: number
    connection_id: string | null
    sql: string
    duration_ms: number | null
    row_count: number | null
    status: string
    error: string | null
    executed_at: string
  }
  virtual_relations: {
    id: string
    connection_id: string
    schema_name: string
    definition: string
    created_at: string
  }
  preferences: { key: string; value: string }
  kv: { key: string; value: string }
}

const provider: MigrationProvider = {
  async getMigrations() {
    return { '001_initial': m001, '002_connection_meta': m002 }
  },
}

export function openStore(dataDir: string): Kysely<StoreSchema> {
  const sqlite = new Database(join(dataDir, 'dblocal.db'))
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return new Kysely<StoreSchema>({ dialect: new SqliteDialect({ database: sqlite }) })
}

export async function migrateStore(db: Kysely<StoreSchema>): Promise<void> {
  const { error } = await new Migrator({ db, provider }).migrateToLatest()
  if (error) throw error
}

let instance: Kysely<StoreSchema> | undefined

export function useStore(): Kysely<StoreSchema> {
  if (!instance) throw new Error('Store not initialised')
  return instance
}

export function setStore(db: Kysely<StoreSchema>): void {
  instance = db
}
