export type Dialect = 'postgres' | 'mysql' | 'sqlite'
export type Environment = 'local' | 'staging' | 'prod'
export type SslMode = 'disable' | 'require' | 'verify-ca' | 'verify-full'
export type SshAuthMethod = 'password' | 'key'
/** Colour of a connection, as a design-system token name. */
export type ConnectionColor = 'accent' | 'success' | 'warning' | 'danger' | 'neutral'

/** What the API returns for a saved connection. Secrets are never included, only `has*` flags. */
export interface ConnectionView {
  id: string
  name: string
  dialect: Dialect
  host: string | null
  port: number | null
  user: string | null
  database: string | null
  filePath: string | null
  environment: Environment
  color: ConnectionColor | null
  readonly: boolean
  /** `DBLOCAL_READONLY` is set: every connection is read-only, whatever its own flag says. */
  readonlyGlobal: boolean
  defaultSchema: string | null
  hasPassword: boolean
  ssl: { mode: SslMode; hasCa: boolean; hasCert: boolean; hasKey: boolean }
  ssh: {
    enabled: boolean
    host: string | null
    port: number | null
    user: string | null
    authMethod: SshAuthMethod
    hasPassword: boolean
    hasPrivateKey: boolean
    hasPassphrase: boolean
  }
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface NamespaceList {
  dialect: Dialect
  /** Databases for MySQL and SQLite, schemas for Postgres. */
  namespaces: string[]
  /** System namespaces, hidden by default in the UI. */
  system: string[]
}
