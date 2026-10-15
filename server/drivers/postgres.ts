import pg from 'pg'
import { DriverError, NETWORK_ERROR_CODES, isDriverError, isTimeoutError, messageOf } from './errors'
import type { SchemaSnapshot } from '#shared/types/db'
import { introspectPostgres } from './introspect/postgres'
import { compileCount, compileGroupCount, compileRows } from '../query/compile'
import type { MutationPlan, MutationResult } from '#shared/types/mutations'
import type { GroupCountPlan, RowsPlan } from '#shared/types/rows'
import { MutationFailedError } from '../query/errors'
import { runMutations } from '../query/run-mutations'
import { tlsOptions } from './ssl'
import type { ConnectionTestResult, Driver, DriverConfig } from './types'

const DEFAULT_PORT = 5432
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000
const DEFAULT_DATABASE = 'postgres'

/** Maps a pg error (SQLSTATE in `code`, or a Node socket code) to a normalised DriverError. */
export function mapPostgresError(err: unknown): DriverError {
  if (isDriverError(err)) return err
  const code = (err as { code?: string })?.code
  const message = messageOf(err)
  if (code === '28P01' || code === '28000') return new DriverError('auth', message, err)
  if (code === '42501') return new DriverError('permission', message, err)
  if (code === '42601') return new DriverError('syntax', message, err)
  if (code?.startsWith('23')) return new DriverError('constraint', message, err)
  if (isTimeoutError(code, message)) return new DriverError('timeout', message, err)
  if (code && NETWORK_ERROR_CODES.has(code)) return new DriverError('network', message, err)
  return new DriverError('unknown', message, err)
}

/** OID of `timestamp without time zone`. */
const TIMESTAMP_OID = 1114

/**
 * `timestamp` has no zone, and node-pg would read its wall time as the server's local time. It is
 * read as UTC instead, which is how edits write it (an ISO instant), so a value round-trips.
 */
const typeParsers: pg.CustomTypesConfig = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') => {
    if (oid === TIMESTAMP_OID && format !== 'binary') {
      return (value: string) => new Date(`${value.replace(' ', 'T')}Z`)
    }
    return pg.types.getTypeParser(oid, format as 'text')
  }) as pg.CustomTypesConfig['getTypeParser'],
}

export async function createPostgresDriver(config: DriverConfig, database?: string): Promise<Driver> {
  const pool = new pg.Pool({
    host: config.host,
    port: config.port ?? DEFAULT_PORT,
    user: config.user,
    password: config.password,
    database: database ?? config.database ?? DEFAULT_DATABASE,
    connectionTimeoutMillis: config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    max: 5,
    types: typeParsers,
    ssl: tlsOptions(config.ssl) as pg.PoolConfig['ssl'],
  })
  // Errors on idle clients are reported through the next query; without a listener they would crash the process.
  pool.on('error', () => {})
  return new PostgresDriver(pool)
}

class PostgresDriver implements Driver {
  readonly dialect = 'postgres' as const

  constructor(private readonly pool: pg.Pool) {}

  async testConnection(): Promise<ConnectionTestResult> {
    const started = performance.now()
    const [row] = await this.query<{ version: string }>('SELECT version() AS version')
    return { serverVersion: row?.version ?? 'unknown', latencyMs: Math.round(performance.now() - started) }
  }

  async listDatabases(): Promise<string[]> {
    const rows = await this.query<{ name: string }>(
      'SELECT datname AS name FROM pg_database WHERE datallowconn AND NOT datistemplate ORDER BY datname',
    )
    return rows.map((r) => r.name)
  }

  async listSchemas(): Promise<string[]> {
    const rows = await this.query<{ name: string }>('SELECT nspname AS name FROM pg_namespace ORDER BY nspname')
    return rows.map((r) => r.name)
  }

  introspect(schema: string): Promise<SchemaSnapshot> {
    return introspectPostgres(<R>(sql: string, params?: unknown[]) => this.rows<R>(sql, params), schema)
  }

  readRows(plan: RowsPlan): Promise<Record<string, unknown>[]> {
    const q = compileRows(plan)
    return this.rows(q.sql, q.parameters as unknown[])
  }

  async countRows(plan: RowsPlan): Promise<number> {
    const q = compileCount(plan)
    const [row] = await this.rows<{ count: string | number }>(q.sql, q.parameters as unknown[])
    return Number(row?.count ?? 0)
  }

  async countGroups(plan: GroupCountPlan): Promise<Record<string, unknown>[]> {
    const q = compileGroupCount(plan)
    return this.rows<Record<string, unknown>>(q.sql, q.parameters as unknown[])
  }

  async applyMutations(plan: MutationPlan): Promise<MutationResult[]> {
    let client: pg.PoolClient
    try {
      client = await this.pool.connect()
    } catch (err) {
      throw mapPostgresError(err)
    }
    try {
      await client.query('BEGIN')
      const results = await runMutations(plan, {
        execute: async (sql, parameters) => {
          try {
            const res = await client.query(sql, parameters as unknown[])
            return { rows: res.rows as Record<string, unknown>[], affected: res.rowCount ?? 0, insertId: null }
          } catch (err) {
            throw mapPostgresError(err)
          }
        },
      })
      await client.query('COMMIT')
      return results
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      if (err instanceof MutationFailedError) throw err
      throw mapPostgresError(err)
    } finally {
      client.release()
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }

  private rows<R>(sql: string, params: unknown[] = []): Promise<R[]> {
    return this.query<R & pg.QueryResultRow>(sql, params)
  }

  private async query<R extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<R[]> {
    try {
      return (await this.pool.query<R>(sql, params)).rows
    } catch (err) {
      throw mapPostgresError(err)
    }
  }
}
