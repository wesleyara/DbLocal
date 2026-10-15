/** What a statement does, as far as a leading-keyword heuristic can tell. The UI asks for confirmation on `write` and `ddl`. */
export type StatementKind = 'read' | 'write' | 'ddl' | 'other'

export const DEFAULT_QUERY_LIMIT = 1000
export const MAX_QUERY_LIMIT = 100_000
export const DEFAULT_QUERY_TIMEOUT_MS = 30_000
export const MAX_QUERY_TIMEOUT_MS = 10 * 60_000
export const MAX_QUERY_SQL_LENGTH = 1_000_000
export const MAX_QUERY_STATEMENTS = 200

export interface QueryRequest {
  sql: string
  schema?: string
  /** Rows kept per statement (default 1000). More rows mark the result `truncated`. */
  limit?: number
  /** Per-statement timeout (default 30 s). */
  timeoutMs?: number
  /** Client-chosen id used to cancel the run through `POST .../query/:queryId/cancel`. */
  queryId?: string
  /** Statements of kind `write` or `ddl` need this on `prod` connections. */
  confirmWrites?: boolean
}

export interface QueryColumn {
  name: string
  /** Type name as the driver reports it (`int4`, `VARCHAR`, `INTEGER`...), or an inferred one in SQLite. */
  type: string
}

export type QueryStatus = 'ok' | 'error' | 'cancelled' | 'timeout' | 'skipped'

export interface StatementResult {
  index: number
  sql: string
  kind: StatementKind
  status: QueryStatus
  columns: QueryColumn[]
  rows: Record<string, unknown>[]
  /** Rows returned (kept rows, or the rows touched by a write that reports them). */
  rowCount: number
  affectedRows: number | null
  durationMs: number
  truncated: boolean
  notices: string[]
  error: { code: string; message: string } | null
}

export interface QueryResponse {
  queryId: string
  durationMs: number
  /** Statements that ran, in order. A failing statement stops the batch: later ones are `skipped`. */
  statements: StatementResult[]
  /** True when a statement of the batch changed the schema, so the cached snapshot was dropped. */
  schemaInvalidated: boolean
}

export interface QueryCancelResponse {
  cancelled: boolean
}
