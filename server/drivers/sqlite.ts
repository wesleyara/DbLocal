import Database from 'better-sqlite3'
import { accessSync, constants } from 'node:fs'
import { DriverError, isDriverError, messageOf } from './errors'
import type { SchemaSnapshot } from '#shared/types/db'
import type { RoutinesSnapshot } from '#shared/types/routines'
import { introspectSqlite } from './introspect/sqlite'
import { routinesSqlite } from './introspect/routines'
import { compileCount, compileGroupCount, compileRows } from '../query/compile'
import type { MutationPlan, MutationResult } from '#shared/types/mutations'
import type { GroupCountPlan, RowsPlan } from '#shared/types/rows'
import { MutationFailedError } from '../query/errors'
import { runMutations } from '../query/run-mutations'
import type {
  ConnectionTestResult,
  Driver,
  DriverConfig,
  QuerySession,
  QuerySessionOptions,
  RawStatementOutput,
  StreamHandlers,
} from './types'

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
    return new SqliteDriver(new Database(filePath, { fileMustExist: true }), filePath)
  } catch (err) {
    throw mapSqliteError(err)
  }
}

class SqliteDriver implements Driver {
  readonly dialect = 'sqlite' as const

  constructor(
    private readonly db: Database.Database,
    private readonly filePath: string,
  ) {}

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

  listRoutines(schema: string): Promise<RoutinesSnapshot> {
    return routinesSqlite(<R>(sql: string) => Promise.resolve(this.run<R[]>(sql, (stmt) => stmt.all())), schema)
  }

  async backupTo(path: string): Promise<void> {
    try {
      await this.db.backup(path)
    } catch (err) {
      throw mapSqliteError(err)
    }
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

  async countGroups(plan: GroupCountPlan): Promise<Record<string, unknown>[]> {
    const q = compileGroupCount(plan)
    return this.run<Record<string, unknown>[]>(q.sql, (stmt) => stmt.all(...bind(q.parameters)))
  }

  async applyMutations(plan: MutationPlan): Promise<MutationResult[]> {
    try {
      this.db.exec('BEGIN')
    } catch (err) {
      throw mapSqliteError(err)
    }
    try {
      const results = await runMutations(plan, {
        execute: async (sql, parameters) => {
          try {
            const stmt = this.db.prepare(sql)
            const args = bind(parameters)
            if (stmt.reader) {
              const rows = stmt.all(...args) as Record<string, unknown>[]
              return { rows, affected: rows.length, insertId: null }
            }
            const info = stmt.run(...args)
            return { rows: [], affected: info.changes, insertId: null }
          } catch (err) {
            throw mapSqliteError(err)
          }
        },
      })
      this.db.exec('COMMIT')
      return results
    } catch (err) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        // The transaction may already be gone (SQLite rolls back on some errors by itself).
      }
      if (err instanceof MutationFailedError) throw err
      throw mapSqliteError(err)
    }
  }

  /**
   * Raw SQL runs on its own handle, so it can yield to the event loop between rows (cancel and
   * timeout are then honoured) without holding the shared handle busy.
   */
  async openQuerySession(options: QuerySessionOptions): Promise<QuerySession> {
    try {
      const db = new Database(this.filePath, { fileMustExist: true, readonly: options.readonly })
      return new SqliteQuerySession(db)
    } catch (err) {
      throw mapSqliteError(err)
    }
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

/** Rows are read in slices of this duration, then the event loop gets a turn (cancel, timeouts). */
const SLICE_MS = 25

function sqliteTypeOf(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'REAL'
  if (typeof value === 'bigint') return 'INTEGER'
  if (typeof value === 'string') return 'TEXT'
  if (value instanceof Uint8Array) return 'BLOB'
  return ''
}

class SqliteQuerySession implements QuerySession {
  private cancelled = false

  constructor(private readonly db: Database.Database) {}

  async run(sql: string, limit: number): Promise<RawStatementOutput> {
    this.cancelled = false
    try {
      const stmt = this.db.prepare(sql)
      if (!stmt.reader) {
        const info = stmt.run()
        return { columns: [], rows: [], truncated: false, affectedRows: info.changes, notices: [] }
      }
      const declared = stmt.columns()
      const rows: unknown[][] = []
      let truncated = false
      let sliceStart = performance.now()
      for (const row of stmt.raw().iterate() as IterableIterator<unknown[]>) {
        if (rows.length >= limit) {
          truncated = true
          break
        }
        rows.push(row)
        if (performance.now() - sliceStart > SLICE_MS) {
          await new Promise<void>((r) => setImmediate(r))
          if (this.cancelled) throw new DriverError('timeout', 'Query cancelled')
          sliceStart = performance.now()
        }
      }
      const columns = declared.map((c, i) => ({
        name: c.name,
        type: c.type ?? sqliteTypeOf(rows.find((r) => r[i] !== null && r[i] !== undefined)?.[i]),
      }))
      return { columns, rows, truncated, affectedRows: null, notices: [] }
    } catch (err) {
      throw mapSqliteError(err)
    }
  }

  async stream(sql: string, handlers: StreamHandlers): Promise<void> {
    this.cancelled = false
    try {
      const stmt = this.db.prepare(sql)
      if (!stmt.reader) throw new DriverError('syntax', 'Only statements that return rows can be exported')
      const declared = stmt.columns()
      let batch: unknown[][] = []
      let sent = false
      const sendColumns = async (sample?: unknown[]) => {
        if (sent) return
        sent = true
        await handlers.onColumns(declared.map((c, i) => ({ name: c.name, type: c.type ?? sqliteTypeOf(sample?.[i]) })))
      }
      let sliceStart = performance.now()
      for (const row of stmt.raw().iterate() as IterableIterator<unknown[]>) {
        await sendColumns(row)
        batch.push(row)
        if (batch.length >= 500) {
          const out = batch
          batch = []
          await handlers.onRows(out)
        }
        if (performance.now() - sliceStart > SLICE_MS) {
          await new Promise<void>((r) => setImmediate(r))
          if (this.cancelled) throw new DriverError('timeout', 'Query cancelled')
          sliceStart = performance.now()
        }
      }
      await sendColumns()
      if (batch.length > 0) await handlers.onRows(batch)
    } catch (err) {
      throw mapSqliteError(err)
    }
  }

  async cancel(): Promise<void> {
    this.cancelled = true
  }

  async close(): Promise<void> {
    this.db.close()
  }
}
