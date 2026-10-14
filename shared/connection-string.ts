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
