import { createServer, type Server } from 'node:net'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDriver, testConnection } from '../../server/drivers'
import { DriverError } from '../../server/drivers/errors'
import type { Driver } from '../../server/drivers/types'

// Dev containers from docker/compose.dev.yml (`pnpm db:up && pnpm db:seed`).
const PG = { id: 'pg', dialect: 'postgres' as const, host: '127.0.0.1', port: 54329, user: 'dblocal', password: 'dblocal', database: 'dblocal_dev' }
const MY = { id: 'my', dialect: 'mysql' as const, host: '127.0.0.1', port: 33069, user: 'dblocal', password: 'dblocal', database: 'dblocal_dev' }
const SQLITE = { id: 'sq', dialect: 'sqlite' as const, filePath: join(process.cwd(), 'fixtures/dev.sqlite') }

describe.each([
  ['postgres', PG],
  ['mysql', MY],
  ['sqlite', SQLITE],
])('%s driver against the dev database', (_name, config) => {
  let driver: Driver

  beforeAll(async () => {
    driver = await createDriver(config)
  })

  afterAll(async () => {
    await driver.close()
  })

  it('reports server version and latency', async () => {
    const result = await driver.testConnection()
    expect(result.serverVersion).toBeTruthy()
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('lists databases and schemas', async () => {
    const databases = await driver.listDatabases()
    const schemas = await driver.listSchemas()
    expect(databases.length).toBeGreaterThan(0)
    expect(schemas.length).toBeGreaterThan(0)
    if (config.dialect !== 'sqlite') expect(databases).toContain('dblocal_dev')
    if (config.dialect === 'postgres') expect(schemas).toContain('public')
    if (config.dialect === 'sqlite') expect(databases).toContain('main')
  })
})

describe('postgres specifics', () => {
  it('reports a PostgreSQL server', async () => {
    const result = await testConnection(PG)
    expect(result.serverVersion).toMatch(/PostgreSQL/)
  })
})

describe('normalised errors', () => {
  it('wrong password is an auth error', async () => {
    await expect(testConnection({ ...PG, password: 'wrong-password' })).rejects.toMatchObject({ code: 'auth' })
    await expect(testConnection({ ...MY, password: 'wrong-password' })).rejects.toMatchObject({ code: 'auth' })
  })

  it('unknown host is a network error', async () => {
    const host = 'no-such-host.invalid'
    await expect(testConnection({ ...PG, host })).rejects.toMatchObject({ code: 'network' })
    await expect(testConnection({ ...MY, host })).rejects.toMatchObject({ code: 'network' })
  })

  it('missing sqlite file is an unknown error with a clear message', async () => {
    const error = await testConnection({ ...SQLITE, filePath: '/no/such/file.db' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DriverError)
    expect((error as DriverError).message).toMatch(/not found/)
  })

  it('a server that never answers times out', async () => {
    const silent: Server = createServer(() => {})
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve))
    const port = (silent.address() as { port: number }).port
    try {
      const timeoutConfig = { host: '127.0.0.1', port, connectTimeoutMs: 500 }
      await expect(testConnection({ ...PG, ...timeoutConfig })).rejects.toMatchObject({ code: 'timeout' })
      await expect(testConnection({ ...MY, ...timeoutConfig })).rejects.toMatchObject({ code: 'timeout' })
    } finally {
      silent.close()
    }
  }, 20_000)
})
