import mysql from 'mysql2/promise'
import { DriverError, NETWORK_ERROR_CODES, isDriverError, isTimeoutError, messageOf } from './errors'
import type { SchemaSnapshot } from '#shared/types/db'
import { introspectMysql } from './introspect/mysql'
import { compileCount, compileGroupCount, compileRows } from '../query/compile'
import type { GroupCountPlan, RowsPlan } from '#shared/types/rows'
import { tlsOptions } from './ssl'
import type { ConnectionTestResult, Driver, DriverConfig } from './types'

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
    ssl: tlsOptions(config.ssl) as mysql.ConnectionOptions['ssl'],
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
