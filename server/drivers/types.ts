import type { SshAuthMethod, SslMode } from '#shared/types/connection'
import type { SchemaSnapshot } from '#shared/types/db'
import type { RoutinesSnapshot } from '#shared/types/routines'
import type { MutationPlan, MutationResult } from '#shared/types/mutations'
import type { GroupCountPlan, RowsPlan } from '#shared/types/rows'

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

/** What a raw statement produced. `rows` holds at most `limit` rows, as arrays aligned with `columns`. */
export interface RawStatementOutput {
  columns: { name: string; type: string }[]
  rows: unknown[][]
  truncated: boolean
  /** Rows changed by INSERT / UPDATE / DELETE, null for statements that do not report it. */
  affectedRows: number | null
  notices: string[]
}

export interface StreamHandlers {
  onColumns(columns: { name: string; type: string }[]): void | Promise<void>
  onRows(rows: unknown[][]): void | Promise<void>
}

export interface QuerySessionOptions {
  /** Postgres schema / MySQL database the statements run against. */
  schema?: string
  /** Statements run in a read-only transaction (PG, MySQL) or on a read-only handle (SQLite). */
  readonly: boolean
}

/**
 * One dedicated connection for a batch of statements, so `SET` and `USE` carry over between them.
 * `cancel` aborts the statement running now on the server.
 */
export interface QuerySession {
  run(sql: string, limit: number): Promise<RawStatementOutput>
  /**
   * Runs one statement and hands its rows over in batches, never holding more than a batch in
   * memory (exports). `onRows` is awaited, so a slow consumer applies back-pressure.
   */
  stream(sql: string, handlers: StreamHandlers): Promise<void>
  cancel(): Promise<void>
  /** `discard` drops the connection instead of returning it to the pool (session state was changed). */
  close(options?: { discard?: boolean }): Promise<void>
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
  /** Reads the functions, procedures and triggers of one schema, with their full definitions. */
  listRoutines(schema: string): Promise<RoutinesSnapshot>
  /** Reads one page of rows. The plan is already validated against the snapshot. */
  readRows(plan: RowsPlan): Promise<Record<string, unknown>[]>
  /** Counts the rows matching the plan's filter. */
  countRows(plan: RowsPlan): Promise<number>
  /** Row counts per distinct value of `plan.groupBy` (used to count related records in batch). */
  countGroups(plan: GroupCountPlan): Promise<Record<string, unknown>[]>
  /**
   * Runs a validated batch of inserts, updates and deletes in one transaction. Any failure rolls
   * everything back and throws a `MutationFailedError` with the index of the operation.
   */
  applyMutations(plan: MutationPlan): Promise<MutationResult[]>
  /** Opens a dedicated session to run raw SQL (the SQL editor). */
  openQuerySession(options: QuerySessionOptions): Promise<QuerySession>
  close(): Promise<void>
}

export type DriverFactory = (config: DriverConfig, database?: string) => Promise<Driver>

export type DriverErrorCode = 'auth' | 'network' | 'timeout' | 'syntax' | 'constraint' | 'permission' | 'unknown'
