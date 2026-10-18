import mysql from 'mysql2/promise'
import { DriverError, NETWORK_ERROR_CODES, isDriverError, isTimeoutError, messageOf } from './errors'
import type { SchemaSnapshot } from '#shared/types/db'
import type { RoutinesSnapshot } from '#shared/types/routines'
import { introspectMysql } from './introspect/mysql'
import { routinesMysql } from './introspect/routines'
import { compileCount, compileGroupCount, compileRows } from '../query/compile'
import type { MutationPlan, MutationResult } from '#shared/types/mutations'
import type { GroupCountPlan, RowsPlan } from '#shared/types/rows'
import { MutationFailedError } from '../query/errors'
import { runMutations } from '../query/run-mutations'
import { tlsOptions } from './ssl'
import type {
  ConnectionTestResult,
  Driver,
  DriverConfig,
  QuerySession,
  QuerySessionOptions,
  RawStatementOutput,
  StreamHandlers,
} from './types'

const DEFAULT_PORT = 3306
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000

const AUTH_CODES = new Set(['ER_ACCESS_DENIED_ERROR'])
const SYNTAX_CODES = new Set(['ER_PARSE_ERROR'])
const CONSTRAINT_CODES = new Set([
  'ER_DUP_ENTRY',
  'ER_NO_REFERENCED_ROW_2',
  'ER_ROW_IS_REFERENCED_2',
  'ER_BAD_NULL_ERROR',
  'ER_CHECK_CONSTRAINT_VIOLATED',
])
const PERMISSION_CODES = new Set([
  'ER_TABLEACCESS_DENIED_ERROR',
  'ER_DBACCESS_DENIED_ERROR',
  'ER_COLUMNACCESS_DENIED_ERROR',
  'ER_SPECIFIC_ACCESS_DENIED_ERROR',
])

/** Maps a mysql2 error (`code` is the MySQL error name or a Node socket code) to a normalised DriverError. */
export function mapMysqlError(err: unknown): DriverError {
  if (isDriverError(err)) return err
  const code = (err as { code?: string })?.code
  const message = messageOf(err)
  if (code && AUTH_CODES.has(code)) return new DriverError('auth', message, err)
  if (code && PERMISSION_CODES.has(code)) return new DriverError('permission', message, err)
  if (code && SYNTAX_CODES.has(code)) return new DriverError('syntax', message, err)
  if (code && CONSTRAINT_CODES.has(code)) return new DriverError('constraint', message, err)
  if (isTimeoutError(code, message)) return new DriverError('timeout', message, err)
  if (code && NETWORK_ERROR_CODES.has(code)) return new DriverError('network', message, err)
  return new DriverError('unknown', message, err)
}

export async function createMysqlDriver(config: DriverConfig, database?: string): Promise<Driver> {
  const pool = mysql.createPool({
    host: config.host,
    port: config.port ?? DEFAULT_PORT,
    user: config.user,
    password: config.password,
    database: database ?? config.database,
    connectTimeout: config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    connectionLimit: 5,
    // Dates are read and written as UTC wall time, so a DATETIME written by an edit reads back
    // as the same instant whatever the server's own time zone is.
    timezone: 'Z',
    ssl: tlsOptions(config.ssl) as mysql.ConnectionOptions['ssl'],
  })
  // TIMESTAMP columns are converted by the session time zone: pin it to UTC as well.
  pool.on('connection', (conn) => {
    // The event hands out the callback-style connection: queue the statement and ignore its result.
    ;(conn as unknown as { query: (sql: string, cb: () => void) => void }).query("SET time_zone = '+00:00'", () => {})
  })
  return new MysqlDriver(pool)
}

class MysqlDriver implements Driver {
  readonly dialect = 'mysql' as const

  constructor(private readonly pool: mysql.Pool) {}

  async testConnection(): Promise<ConnectionTestResult> {
    const started = performance.now()
    const [row] = await this.query<{ version: string }>('SELECT VERSION() AS version')
    return { serverVersion: row?.version ?? 'unknown', latencyMs: Math.round(performance.now() - started) }
  }

  async listDatabases(): Promise<string[]> {
    const rows = await this.query<{ name: string }>(
      'SELECT schema_name AS name FROM information_schema.schemata ORDER BY schema_name',
    )
    return rows.map((r) => r.name)
  }

  /** In MySQL a "schema" is a database, so the list is the same as `listDatabases`. */
  listSchemas(): Promise<string[]> {
    return this.listDatabases()
  }

  introspect(schema: string): Promise<SchemaSnapshot> {
    return introspectMysql(<R>(sql: string, params?: unknown[]) => this.rows<R>(sql, params), schema)
  }

  listRoutines(schema: string): Promise<RoutinesSnapshot> {
    return routinesMysql(<R>(sql: string, params?: unknown[]) => this.rows<R>(sql, params), schema)
  }

  readRows(plan: RowsPlan): Promise<Record<string, unknown>[]> {
    const q = compileRows(plan)
    return this.query(q.sql, q.parameters as unknown[])
  }

  async countRows(plan: RowsPlan): Promise<number> {
    const q = compileCount(plan)
    const [row] = await this.query<{ count: string | number }>(q.sql, q.parameters as unknown[])
    return Number(row?.count ?? 0)
  }

  async countGroups(plan: GroupCountPlan): Promise<Record<string, unknown>[]> {
    const q = compileGroupCount(plan)
    return this.query<Record<string, unknown>>(q.sql, q.parameters as unknown[])
  }

  async applyMutations(plan: MutationPlan): Promise<MutationResult[]> {
    let conn: mysql.PoolConnection
    try {
      conn = await this.pool.getConnection()
    } catch (err) {
      throw mapMysqlError(err)
    }
    try {
      await conn.beginTransaction()
      const results = await runMutations(plan, {
        execute: async (sql, parameters) => {
          try {
            const [res] = await conn.query(sql, parameters as unknown[])
            if (Array.isArray(res)) return { rows: res as Record<string, unknown>[], affected: res.length, insertId: null }
            const header = res as mysql.ResultSetHeader
            return { rows: [], affected: header.affectedRows, insertId: header.insertId > 0 ? header.insertId : null }
          } catch (err) {
            throw mapMysqlError(err)
          }
        },
      })
      await conn.commit()
      return results
    } catch (err) {
      await conn.rollback().catch(() => {})
      if (err instanceof MutationFailedError) throw err
      throw mapMysqlError(err)
    } finally {
      conn.release()
    }
  }

  async openQuerySession(options: QuerySessionOptions): Promise<QuerySession> {
    let conn: mysql.PoolConnection
    try {
      conn = await this.pool.getConnection()
    } catch (err) {
      throw mapMysqlError(err)
    }
    try {
      const [current] = await conn.query<mysql.RowDataPacket[]>('SELECT DATABASE() AS db')
      if (options.schema) await conn.query(`USE \`${options.schema.replaceAll('`', '``')}\``)
      // Session-wide, not `START TRANSACTION READ ONLY`: DDL commits the transaction implicitly and would then run.
      if (options.readonly) await conn.query('SET SESSION TRANSACTION READ ONLY')
      return new MysqlQuerySession(this.pool, conn, conn.threadId, options.readonly, (current[0]?.db as string | null | undefined) ?? null)
    } catch (err) {
      conn.destroy()
      throw mapMysqlError(err)
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }

  private rows<R>(sql: string, params: unknown[] = []): Promise<R[]> {
    return this.query<R & object>(sql, params)
  }

  private async query<R extends object>(sql: string, params: unknown[] = []): Promise<R[]> {
    try {
      const [rows] = await this.pool.query<mysql.RowDataPacket[]>(sql, params)
      return rows as R[]
    } catch (err) {
      throw mapMysqlError(err)
    }
  }
}

const MYSQL_TYPE_NAMES: Record<number, string> = {
  0: 'DECIMAL', 1: 'TINYINT', 2: 'SMALLINT', 3: 'INT', 4: 'FLOAT', 5: 'DOUBLE', 6: 'NULL', 7: 'TIMESTAMP',
  8: 'BIGINT', 9: 'MEDIUMINT', 10: 'DATE', 11: 'TIME', 12: 'DATETIME', 13: 'YEAR', 15: 'VARCHAR', 16: 'BIT',
  245: 'JSON', 246: 'DECIMAL', 247: 'ENUM', 248: 'SET', 249: 'TINYBLOB', 250: 'MEDIUMBLOB', 251: 'LONGBLOB',
  252: 'BLOB', 253: 'VARCHAR', 254: 'CHAR', 255: 'GEOMETRY',
}

interface MysqlField {
  name: string
  columnType?: number
  type?: number
}

class MysqlQuerySession implements QuerySession {
  private closed = false

  constructor(
    private readonly pool: mysql.Pool,
    private readonly conn: mysql.PoolConnection,
    private readonly threadId: number,
    private readonly readonly: boolean,
    private readonly previousDatabase: string | null,
  ) {}

  run(sql: string, limit: number): Promise<RawStatementOutput> {
    return new Promise((resolve, reject) => {
      const rows: unknown[][] = []
      let fields: MysqlField[] = []
      let affected: number | null = null
      let truncated = false
      const query = (this.conn as unknown as { connection: { query: (o: object) => import('node:events').EventEmitter } })
        .connection.query({ sql, rowsAsArray: true })
      // Statements without a result set emit `fields` with `undefined`.
      query.on('fields', (f: MysqlField[] | undefined) => {
        fields = f ?? []
      })
      query.on('result', (row: unknown) => {
        if (Array.isArray(row)) {
          if (rows.length < limit) rows.push(row)
          else if (!truncated) {
            // One row past the limit: stop the server from sending the rest.
            truncated = true
            void this.cancel()
          }
        } else if (row && typeof row === 'object' && 'affectedRows' in row) {
          affected = Number((row as mysql.ResultSetHeader).affectedRows)
        }
      })
      query.on('error', (err: unknown) => {
        if (truncated) finish()
        else reject(mapMysqlError(err))
      })
      query.on('end', () => finish())
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve({
          columns: fields.map((f) => ({ name: f.name, type: MYSQL_TYPE_NAMES[f.columnType ?? f.type ?? -1] ?? 'UNKNOWN' })),
          rows,
          truncated,
          affectedRows: affected,
          notices: [],
        })
      }
    })
  }

  async stream(sql: string, handlers: StreamHandlers): Promise<void> {
    let fields: MysqlField[] = []
    const query = (
      this.conn as unknown as {
        connection: { query: (o: object) => import('node:events').EventEmitter & { stream: (o?: object) => AsyncIterable<unknown> } }
      }
    ).connection.query({ sql, rowsAsArray: true })
    query.on('fields', (f: MysqlField[] | undefined) => {
      fields = f ?? []
    })
    let columnsSent = false
    let batch: unknown[][] = []
    try {
      for await (const row of query.stream({ highWaterMark: 500 })) {
        if (!columnsSent) {
          columnsSent = true
          await handlers.onColumns(fields.map((f) => ({ name: f.name, type: MYSQL_TYPE_NAMES[f.columnType ?? f.type ?? -1] ?? 'UNKNOWN' })))
        }
        if (!Array.isArray(row)) continue
        batch.push(row)
        if (batch.length >= 500) {
          const out = batch
          batch = []
          await handlers.onRows(out)
        }
      }
      if (!columnsSent) await handlers.onColumns(fields.map((f) => ({ name: f.name, type: MYSQL_TYPE_NAMES[f.columnType ?? f.type ?? -1] ?? 'UNKNOWN' })))
      if (batch.length > 0) await handlers.onRows(batch)
    } catch (err) {
      throw mapMysqlError(err)
    }
  }

  /** Cancels the running statement from another pool connection (`KILL QUERY`). */
  async cancel(): Promise<void> {
    if (this.closed) return
    await this.pool.query(`KILL QUERY ${Number(this.threadId)}`).catch(() => {})
  }

  async close(options: { discard?: boolean } = {}): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (options.discard) {
      this.conn.destroy()
      return
    }
    try {
      if (this.readonly) await this.conn.query('SET SESSION TRANSACTION READ WRITE')
      if (this.previousDatabase) await this.conn.query(`USE \`${this.previousDatabase.replaceAll('`', '``')}\``)
      this.conn.release()
    } catch {
      this.conn.destroy()
    }
  }
}
