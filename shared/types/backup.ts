export interface DumpRequest {
  /** Postgres schema / MySQL database / SQLite attached database; the connection's default when absent. */
  schema?: string
  /** Only these tables (and their triggers); all tables, views and routines when absent. */
  tables?: string[]
  structure: boolean
  data: boolean
}

/** One line of the restore NDJSON stream. */
export type RestoreEvent =
  | { type: 'start'; total: number }
  | { type: 'progress'; done: number; total: number }
  | { type: 'error'; index: number; sql: string; message: string }
  | { type: 'done'; executed: number; total: number; durationMs: number; failed: boolean }

/** Backup of DbLocal's own store (`POST /api/workspace/export`), the file the import reads back. */
export interface WorkspaceBackup {
  format: 'dblocal-workspace'
  version: 1
  createdAt: string
  /** Key derivation for the secrets; null when the backup was made without a password (no secrets). */
  kdf: { name: 'scrypt'; salt: string; N: number; r: number; p: number; check: string } | null
  connections: Record<string, unknown>[]
  savedQueries: Record<string, unknown>[]
  virtualRelations: Record<string, unknown>[]
  preferences: { key: string; value: string }[]
  history: Record<string, unknown>[] | null
}

export interface WorkspaceImportResult {
  connections: number
  savedQueries: number
  virtualRelations: number
  preferences: number
  history: number
  /** Connections whose secrets could not be carried over (backup made without a password). */
  withoutSecrets: number
}
