import type { Dialect, SslMode } from './types/connection'

/** Fields a connection string can fill. Explicit form fields always win over these. */
export interface ParsedConnection {
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
  filePath?: string
  sslMode?: SslMode
}

export class ConnectionStringError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConnectionStringError'
  }
}

const URL_PROTOCOLS: Record<Exclude<Dialect, 'sqlite'>, string[]> = {
  postgres: ['postgres:', 'postgresql:'],
  mysql: ['mysql:'],
}

/** libpq `sslmode` values mapped onto DbLocal's SSL modes. */
const SSLMODE: Record<string, SslMode> = {
  disable: 'disable',
  allow: 'disable',
  prefer: 'require',
  require: 'require',
  'verify-ca': 'verify-ca',
  'verify-full': 'verify-full',
}

/** Parses a connection string for one dialect. Malformed input throws a ConnectionStringError. */
export function parseConnectionString(dialect: Dialect, input: string): ParsedConnection {
  const raw = input.trim()
  if (dialect === 'sqlite') {
    // `libsql://db-org.turso.io?authToken=...`: a remote Turso database, not a file.
    if (/^(libsql|https?|wss?):\/\//i.test(raw)) {
      let remote: URL
      try {
        remote = new URL(raw)
      } catch {
        throw new ConnectionStringError('Invalid connection string')
      }
      const token = remote.searchParams.get('authToken') ?? remote.searchParams.get('auth_token')
      remote.searchParams.delete('authToken')
      remote.searchParams.delete('auth_token')
      const search = remote.searchParams.toString()
      const base = `${remote.protocol}//${remote.host}${remote.pathname === '/' ? '' : remote.pathname}${search ? `?${search}` : ''}`
      return { host: base, password: token ?? undefined }
    }
    const filePath = raw.replace(/^sqlite:(\/\/)?/i, '')
    if (!filePath) throw new ConnectionStringError('SQLite connection string has no file path')
    return { filePath }
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ConnectionStringError('Invalid connection string')
  }
  if (!URL_PROTOCOLS[dialect].includes(url.protocol)) {
    throw new ConnectionStringError(`Connection string does not match the ${dialect} dialect`)
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  const sslmode = url.searchParams.get('sslmode')
  return {
    host: url.hostname || undefined,
    port: url.port ? Number(url.port) : undefined,
    user: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    database: database || undefined,
    sslMode: sslmode ? SSLMODE[sslmode] : undefined,
  }
}

/** Dialect of a connection string, from its scheme (`postgres://`, `mysql://`, `libsql://`) or a file path. */
export function detectDialect(input: string): Dialect {
  const raw = input.trim()
  if (/^postgres(ql)?:\/\//i.test(raw)) return 'postgres'
  if (/^mysql:\/\//i.test(raw)) return 'mysql'
  if (/^(libsql|https?|wss?|sqlite):/i.test(raw)) return 'sqlite'
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    throw new ConnectionStringError(`Unsupported connection string scheme: ${raw.split('://')[0]}`)
  }
  return 'sqlite'
}

/** A readable connection name that never carries the password: `user@host/db` or the file name. */
export function connectionNameFor(dialect: Dialect, parsed: ParsedConnection): string {
  if (parsed.filePath) return parsed.filePath.split(/[\\/]/).pop() || parsed.filePath
  if (dialect === 'sqlite' && parsed.host) return parsed.host.replace(/^[a-z]+:\/\//i, '').split('?')[0]!
  const where = `${parsed.host ?? 'localhost'}${parsed.port ? `:${parsed.port}` : ''}`
  return `${parsed.database ? `${parsed.database}@` : ''}${where}`
}
