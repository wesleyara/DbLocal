import type { SshAuthMethod, SslMode } from '#shared/types/connection'
import type { SchemaSnapshot } from '#shared/types/db'
import type { RowsPlan } from '#shared/types/rows'

export type Dialect = 'postgres' | 'mysql' | 'sqlite'

export interface SslOptions {
  mode: SslMode
  ca?: string
  cert?: string
  key?: string
}

export interface SshOptions {
  host: string
  port: number
  user: string
  authMethod: SshAuthMethod
  password?: string
  privateKey?: string
  passphrase?: string
}

/** Resolved connection settings handed to a driver factory. Secrets are already decrypted here. */
export interface DriverConfig {
  id: string
  dialect: Dialect
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
  filePath?: string
  connectTimeoutMs?: number
  ssl?: SslOptions
  /** When set, the database is reached through an SSH tunnel opened for this connection. */
  ssh?: SshOptions
}

export interface ConnectionTestResult {
  serverVersion: string
  latencyMs: number
}

/**
 * The single contract every database dialect implements. Routes talk to this interface only.
 * Introspection, reads, writes and raw queries are added to it by the epics that need them.
 */
export interface Driver {
  readonly dialect: Dialect
  testConnection(): Promise<ConnectionTestResult>
  listDatabases(): Promise<string[]>
  listSchemas(): Promise<string[]>
  /** Reads tables, views, columns, keys and indexes of one schema (Postgres schema, MySQL database, SQLite file). */
  introspect(schema: string): Promise<SchemaSnapshot>
  /** Reads one page of rows. The plan is already validated against the snapshot. */
  readRows(plan: RowsPlan): Promise<Record<string, unknown>[]>
  /** Counts the rows matching the plan's filter. */
  countRows(plan: RowsPlan): Promise<number>
  close(): Promise<void>
}

export type DriverFactory = (config: DriverConfig, database?: string) => Promise<Driver>

export type DriverErrorCode = 'auth' | 'network' | 'timeout' | 'syntax' | 'constraint' | 'permission' | 'unknown'
