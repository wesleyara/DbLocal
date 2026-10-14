import Database from 'better-sqlite3'
import { accessSync, constants } from 'node:fs'
import { DriverError, isDriverError, messageOf } from './errors'
import type { SchemaSnapshot } from '#shared/types/db'
import { introspectSqlite } from './introspect/sqlite'
import { compileCount, compileRows } from '../query/compile'
import type { RowsPlan } from '#shared/types/rows'
import type { ConnectionTestResult, Driver, DriverConfig } from './types'

/** Maps a better-sqlite3 error (`code` is the SQLite result code name) to a normalised DriverError. */
export function mapSqliteError(err: unknown): DriverError {
  if (isDriverError(err)) return err
  const code = (err as { code?: string })?.code ?? ''
  const message = messageOf(err)
  if (code === 'SQLITE_CANTOPEN' || code === 'SQLITE_PERM' || code === 'SQLITE_AUTH') {
    return new DriverError('permission', message, err)
  }
  if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED') return new DriverError('timeout', message, err)
  if (code.startsWith('SQLITE_CONSTRAINT')) return new DriverError('constraint', message, err)
  return new DriverError('unknown', message, err)
}

/** better-sqlite3 binds numbers, strings, bigints, buffers and null only: booleans become 0 / 1. */
function bind(params: readonly unknown[]): unknown[] {
  return params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p))
}

export async function createSqliteDriver(config: DriverConfig): Promise<Driver> {
  const filePath = config.filePath
  if (!filePath) throw new DriverError('syntax', 'SQLite file path is required')
  try {
    accessSync(filePath, constants.R_OK)
  } catch (err) {
    const missing = (err as { code?: string }).code === 'ENOENT'
    throw new DriverError(
      missing ? 'unknown' : 'permission',
      missing ? `SQLite file not found: ${filePath}` : `SQLite file is not readable: ${filePath}`,
      err,
    )
  }
  try {
    return new SqliteDriver(new Database(filePath, { fileMustExist: true }))
  } catch (err) {
    throw mapSqliteError(err)
  }
}

class SqliteDriver implements Driver {
  readonly dialect = 'sqlite' as const

  constructor(private readonly db: Database.Database) {}

  async testConnection(): Promise<ConnectionTestResult> {
    const started = performance.now()
    const { version } = this.run<{ version: string }>('SELECT sqlite_version() AS version', (stmt) => stmt.get())
    return { serverVersion: version, latencyMs: Math.round(performance.now() - started) }
  }

  /** SQLite has no server-level databases: the file is `main`, plus any attached databases. */
  async listDatabases(): Promise<string[]> {
    return this.run<{ name: string }[]>('PRAGMA database_list', (stmt) => stmt.all()).map((r) => r.name)
  }

  listSchemas(): Promise<string[]> {
    return this.listDatabases()
  }

  introspect(schema: string): Promise<SchemaSnapshot> {
    return introspectSqlite(<R>(sql: string) => Promise.resolve(this.run<R[]>(sql, (stmt) => stmt.all())), schema)
  }

  async readRows(plan: RowsPlan): Promise<Record<string, unknown>[]> {
    const q = compileRows(plan)
    return this.run<Record<string, unknown>[]>(q.sql, (stmt) => stmt.all(...bind(q.parameters)))
  }

  async countRows(plan: RowsPlan): Promise<number> {
    const q = compileCount(plan)
    const [row] = this.run<{ count: number }[]>(q.sql, (stmt) => stmt.all(...bind(q.parameters)))
    return Number(row?.count ?? 0)
  }

  async close(): Promise<void> {
    this.db.close()
  }

  private run<T>(sql: string, read: (stmt: Database.Statement) => unknown): T {
    try {
      return read(this.db.prepare(sql)) as T
    } catch (err) {
      throw mapSqliteError(err)
    }
  }
}
