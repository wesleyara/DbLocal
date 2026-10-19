import { getPoolManager } from './pool-manager'
import { createMysqlDriver } from './mysql'
import { createPostgresDriver } from './postgres'
import { createSqliteDriver } from './sqlite'
import { createTursoDriver } from './turso'
import { resolveConnectHost } from './docker-host'
import { openSshTunnel, type SshTunnel } from './ssh-tunnel'
import type { ConnectionTestResult, Driver, DriverConfig, DriverFactory } from './types'

async function createPlainDriver(config: DriverConfig, database?: string): Promise<Driver> {
  switch (config.dialect) {
    case 'postgres':
      return createPostgresDriver(config, database)
    case 'mysql':
      return createMysqlDriver(config, database)
    case 'sqlite':
      // A SQLite connection with a URL (no file) is a remote libSQL / Turso database.
      return config.host && !config.filePath ? createTursoDriver(config) : createSqliteDriver(config)
  }
}

/**
 * Creates a driver. When the connection has an SSH config (not for SQLite), the tunnel is opened
 * first and the driver connects to its local end. Closing the driver closes the tunnel too.
 * If the tunnel drops, the connection's pools are invalidated so the next use reconnects.
 */
export const createDriver: DriverFactory = async (config, database) => {
  if (config.dialect === 'sqlite') return createPlainDriver(config, database)
  // Under SSH the target is resolved on the remote side, so only direct connections are rewritten.
  if (!config.ssh) {
    return createPlainDriver({ ...config, host: resolveConnectHost(config.host) ?? undefined }, database)
  }

  const tunnel: SshTunnel = await openSshTunnel(
    config.ssh,
    { host: config.host ?? '127.0.0.1', port: config.port ?? defaultPort(config.dialect) },
    () => void getPoolManager().invalidate(config.id),
  )
  try {
    const driver = await createPlainDriver(
      { ...config, host: '127.0.0.1', port: tunnel.localPort },
      database,
    )
    return withTunnel(driver, tunnel)
  } catch (err) {
    await tunnel.close()
    throw err
  }
}

function defaultPort(dialect: DriverConfig['dialect']): number {
  return dialect === 'mysql' ? 3306 : 5432
}

function withTunnel(driver: Driver, tunnel: SshTunnel): Driver {
  return {
    dialect: driver.dialect,
    testConnection: () => driver.testConnection(),
    listDatabases: () => driver.listDatabases(),
    listSchemas: () => driver.listSchemas(),
    introspect: (schema) => driver.introspect(schema),
    listRoutines: (schema) => driver.listRoutines(schema),
    backupTo: driver.backupTo ? (path) => driver.backupTo!(path) : undefined,
    readRows: (plan) => driver.readRows(plan),
    countRows: (plan) => driver.countRows(plan),
    countGroups: (plan) => driver.countGroups(plan),
    applyMutations: (plan) => driver.applyMutations(plan),
    openQuerySession: (options) => driver.openQuerySession(options),
    async close() {
      try {
        await driver.close()
      } finally {
        await tunnel.close()
      }
    },
  }
}

/** Opens a throw-away driver for a config that is not saved, runs the check, and always closes it. */
export async function testConnection(config: DriverConfig): Promise<ConnectionTestResult> {
  const driver = await createDriver(config)
  try {
    return await driver.testConnection()
  } finally {
    await driver.close()
  }
}

export * from './errors'
export * from './types'
export { getPoolManager, PoolManager } from './pool-manager'
