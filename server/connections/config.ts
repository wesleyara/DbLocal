import { parseConnectionString, ConnectionStringError, type ParsedConnection } from '#shared/connection-string'
import type { ConnectionTestInput } from '#shared/schemas/connection'
import { DriverError } from '../drivers/errors'
import { normalizeTursoUrl } from '../drivers/turso'
import type { DriverConfig, SshOptions, SslOptions } from '../drivers/types'

const DEFAULT_SSH_PORT = 22

/**
 * Builds the driver config from a draft with plain secrets. This is the only place where a form,
 * a connection string and a stored connection turn into driver settings. Explicit fields win over
 * the connection string, which only fills what is missing. Invalid input throws a `syntax` DriverError.
 */
export function buildDriverConfig(input: ConnectionTestInput, id = 'test'): DriverConfig {
  let parsed: ParsedConnection = {}
  if (input.connectionString) {
    try {
      parsed = parseConnectionString(input.dialect, input.connectionString)
    } catch (err) {
      if (err instanceof ConnectionStringError) throw new DriverError('syntax', err.message, err)
      throw err
    }
  }

  const config: DriverConfig = {
    id,
    dialect: input.dialect,
    host: input.host ?? parsed.host,
    port: input.port ?? parsed.port,
    user: input.user ?? parsed.user,
    password: input.password ?? parsed.password,
    database: input.database ?? parsed.database,
    filePath: input.filePath ?? parsed.filePath,
  }

  if (config.dialect === 'sqlite') {
    // A URL instead of a file: Turso / libSQL, reached over the network with an auth token (`password`).
    if (config.host && !config.filePath) {
      config.host = normalizeTursoUrl(config.host)
      return config
    }
    if (!config.filePath) throw new DriverError('syntax', 'SQLite needs a file path or a Turso URL')
    return config
  }

  if (!config.host) throw new DriverError('syntax', `${config.dialect} needs a host`)

  const mode = input.ssl.mode === 'disable' && parsed.sslMode ? parsed.sslMode : input.ssl.mode
  if (mode !== 'disable') config.ssl = sslOptions(mode, input.ssl)
  if (input.ssh?.enabled) config.ssh = sshOptions(input.ssh)
  return config
}

function sslOptions(mode: SslOptions['mode'], ssl: ConnectionTestInput['ssl']): SslOptions {
  return {
    mode,
    ...(ssl.ca ? { ca: ssl.ca } : {}),
    ...(ssl.cert ? { cert: ssl.cert } : {}),
    ...(ssl.key ? { key: ssl.key } : {}),
  }
}

function sshOptions(ssh: NonNullable<ConnectionTestInput['ssh']>): SshOptions {
  if (!ssh.host) throw new DriverError('syntax', 'SSH needs a host')
  if (!ssh.user) throw new DriverError('syntax', 'SSH needs a user')
  if (ssh.authMethod === 'key' && !ssh.privateKey) throw new DriverError('syntax', 'SSH key auth needs a private key')
  return {
    host: ssh.host,
    port: ssh.port ?? DEFAULT_SSH_PORT,
    user: ssh.user,
    authMethod: ssh.authMethod,
    ...(ssh.password ? { password: ssh.password } : {}),
    ...(ssh.privateKey ? { privateKey: ssh.privateKey } : {}),
    ...(ssh.passphrase ? { passphrase: ssh.passphrase } : {}),
  }
}
