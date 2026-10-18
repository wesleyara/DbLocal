import { createClient, type Client, type InValue, type ResultSet, type Transaction } from '@libsql/client/web'
import type { SchemaSnapshot } from '#shared/types/db'
import type { MutationPlan, MutationResult } from '#shared/types/mutations'
import type { GroupCountPlan, RowsPlan } from '#shared/types/rows'
import { compileCount, compileGroupCount, compileRows } from '../query/compile'
import { MutationFailedError } from '../query/errors'
import { runMutations } from '../query/run-mutations'
import { DriverError, isDriverError, messageOf } from './errors'
import type { RoutinesSnapshot } from '#shared/types/routines'
import { introspectSqlite } from './introspect/sqlite'
import { routinesSqlite } from './introspect/routines'
import { mapSqliteError } from './sqlite'
import type {
  ConnectionTestResult,
  Driver,
  DriverConfig,
  QuerySession,
  QuerySessionOptions,
  RawStatementOutput,
  StreamHandlers,
} from './types'

/** Rows per round trip when a result is streamed (exports): bounded memory on a remote database. */
const STREAM_PAGE = 1000

/** Turso / libSQL is spoken over HTTP or WebSocket; `libsql://` is Turso's own scheme for the same thing. */
export function normalizeTursoUrl(raw: string): string {
  const url = raw.trim()
  if (!/^(libsql|https?|wss?):\/\//i.test(url)) {
    throw new DriverError('syntax', 'Turso URL must start with libsql://, https:// or wss://')
  }
  return url
}

/** Maps a libSQL client error (`code` is `SQLITE_*`, `SERVER_ERROR`, `HRANA_*`...) to a normalised one. */
export function mapTursoError(err: unknown): DriverError {
  if (isDriverError(err)) return err
  const code = String((err as { code?: string })?.code ?? '')
  const message = messageOf(err)
  const lower = message.toLowerCase()
  if (code.startsWith('SQLITE_')) return mapSqliteError({ code, message })
  if (/\b401\b|\b403\b|unauthor|forbidden|jwt|invalid.*token|auth/.test(lower)) return new DriverError('auth', message, err)
  if (/enotfound|econnrefused|econnreset|etimedout|fetch failed|network|getaddrinfo|socket/.test(lower)) {
    return new DriverError('network', message, err)
  }
  if (/syntax error|no such table|no such column|near "/.test(lower)) return new DriverError('syntax', message, err)
  return new DriverError('unknown', message, err)
}

/** booleans are not a SQLite type; the rest of the values pass through. */
const bind = (params: readonly unknown[]): InValue[] =>
  params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : (p as InValue)))

/** A libSQL row is array-like with named properties; the shared code expects plain objects. */
const toObjects = (rs: ResultSet): Record<string, unknown>[] =>
  rs.rows.map((row) => Object.fromEntries(rs.columns.map((c, i) => [c, row[i]])))

export async function createTursoDriver(config: DriverConfig): Promise<Driver> {
  if (!config.host) throw new DriverError('syntax', 'Turso needs a database URL')
  const client = createClient({
    url: normalizeTursoUrl(config.host),
    authToken: config.password || undefined,
    intMode: 'number',
  })
  return new TursoDriver(client)
}

class TursoDriver implements Driver {
  readonly dialect = 'sqlite' as const

  constructor(private readonly client: Client) {}

  private async exec(sql: string, args: InValue[] = []): Promise<ResultSet> {
    try {
      return await this.client.execute({ sql, args })
    } catch (err) {
      throw mapTursoError(err)
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const started = performance.now()
    const rs = await this.exec('SELECT sqlite_version() AS version')
    return { serverVersion: `libSQL (SQLite ${String(rs.rows[0]?.[0] ?? '?')})`, latencyMs: Math.round(performance.now() - started) }
  }

  async listDatabases(): Promise<string[]> {
    const rs = await this.exec('PRAGMA database_list')
    return toObjects(rs).map((r) => String(r.name))
  }

  listSchemas(): Promise<string[]> {
    return this.listDatabases()
  }

  introspect(schema: string): Promise<SchemaSnapshot> {
    return introspectSqlite(async <R>(sql: string) => toObjects(await this.exec(sql)) as R[], schema)
  }

  listRoutines(schema: string): Promise<RoutinesSnapshot> {
    return routinesSqlite(async <R>(sql: string) => toObjects(await this.exec(sql)) as R[], schema)
  }

  async readRows(plan: RowsPlan): Promise<Record<string, unknown>[]> {
    const q = compileRows(plan)
    return toObjects(await this.exec(q.sql, bind(q.parameters)))
  }

  async countRows(plan: RowsPlan): Promise<number> {
    const q = compileCount(plan)
    const rs = await this.exec(q.sql, bind(q.parameters))
    return Number(toObjects(rs)[0]?.count ?? 0)
  }

  async countGroups(plan: GroupCountPlan): Promise<Record<string, unknown>[]> {
    const q = compileGroupCount(plan)
    return toObjects(await this.exec(q.sql, bind(q.parameters)))
  }

  async applyMutations(plan: MutationPlan): Promise<MutationResult[]> {
    let tx: Transaction
    try {
      tx = await this.client.transaction('write')
    } catch (err) {
      throw mapTursoError(err)
    }
    try {
      const results = await runMutations(plan, {
        execute: async (sql, parameters) => {
          try {
            const rs = await tx.execute({ sql, args: bind(parameters) })
            const rows = toObjects(rs)
            return rs.columns.length > 0
              ? { rows, affected: rows.length, insertId: null }
              : { rows: [], affected: rs.rowsAffected, insertId: null }
          } catch (err) {
            throw mapTursoError(err)
          }
        },
      })
      await tx.commit()
      return results
    } catch (err) {
      await tx.rollback().catch(() => {})
      if (err instanceof MutationFailedError) throw err
      throw mapTursoError(err)
    } finally {
      tx.close()
    }
  }

  async openQuerySession(options: QuerySessionOptions): Promise<QuerySession> {
    return new TursoQuerySession(this.client, options.readonly)
  }

  async close(): Promise<void> {
    this.client.close()
  }
}

/**
 * Raw SQL against a remote database. There is no server-side cancel in the protocol: `cancel`
 * stops waiting (the statement may finish on the server). Read-only sessions send every statement
 * in a read transaction, which the server enforces.
 */
class TursoQuerySession implements QuerySession {
  private abort: ((err: DriverError) => void) | null = null

  constructor(
    private readonly client: Client,
    private readonly readonly: boolean,
  ) {}

  private async send(sql: string): Promise<ResultSet> {
    const request = this.readonly
      ? this.client.batch([sql], 'read').then((r) => r[0]!)
      : this.client.execute(sql)
    const cancelled = new Promise<never>((_, reject) => {
      this.abort = reject
    })
    try {
      return await Promise.race([request, cancelled])
    } catch (err) {
      throw mapTursoError(err)
    } finally {
      this.abort = null
    }
  }

  async run(sql: string, limit: number): Promise<RawStatementOutput> {
    const rs = await this.send(sql)
    if (rs.columns.length === 0) {
      return { columns: [], rows: [], truncated: false, affectedRows: rs.rowsAffected, notices: [] }
    }
    const truncated = rs.rows.length > limit
    const rows = (truncated ? rs.rows.slice(0, limit) : rs.rows).map((r) => rs.columns.map((_, i) => r[i]))
    const columns = rs.columns.map((name, i) => ({ name, type: rs.columnTypes?.[i] || '' }))
    return { columns, rows, truncated, affectedRows: null, notices: [] }
  }

  /** Pages through `select * from (<sql>)` so a large export never holds more than a page. */
  async stream(sql: string, handlers: StreamHandlers): Promise<void> {
    let offset = 0
    let first = true
    for (;;) {
      const rs = await this.send(`SELECT * FROM (${sql}) LIMIT ${STREAM_PAGE} OFFSET ${offset}`)
      if (first) {
        first = false
        await handlers.onColumns(rs.columns.map((name, i) => ({ name, type: rs.columnTypes?.[i] || '' })))
      }
      if (rs.rows.length === 0) return
      await handlers.onRows(rs.rows.map((r) => rs.columns.map((_, i) => r[i])))
      if (rs.rows.length < STREAM_PAGE) return
      offset += rs.rows.length
    }
  }

  async cancel(): Promise<void> {
    this.abort?.(new DriverError('timeout', 'Query cancelled'))
  }

  async close(): Promise<void> {
    // The client is shared with the driver: nothing to release per session.
  }
}
