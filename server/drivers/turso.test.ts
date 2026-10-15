import { describe, expect, it } from 'vitest'
import { parseConnectionString } from '#shared/connection-string'
import { buildDriverConfig } from '../connections/config'
import { DriverError } from './errors'
import { createTursoDriver, mapTursoError, normalizeTursoUrl } from './turso'

const libsqlError = (code: string, message: string) => Object.assign(new Error(message), { code })

describe('turso connection', () => {
  it('accepts libsql, https and wss URLs only', () => {
    expect(normalizeTursoUrl(' libsql://db-org.turso.io ')).toBe('libsql://db-org.turso.io')
    expect(() => normalizeTursoUrl('postgres://x')).toThrow(DriverError)
    expect(() => normalizeTursoUrl('/tmp/a.db')).toThrow(DriverError)
  })

  it('splits the auth token out of a pasted URL', () => {
    expect(parseConnectionString('sqlite', 'libsql://db-org.turso.io?authToken=abc.def')).toEqual({
      host: 'libsql://db-org.turso.io',
      password: 'abc.def',
    })
    expect(parseConnectionString('sqlite', '/data/app.db')).toEqual({ filePath: '/data/app.db' })
  })

  it('builds a driver config from the URL and the token, and still requires one of file or URL', () => {
    const base = { dialect: 'sqlite' as const, ssl: { mode: 'disable' as const } }
    const cfg = buildDriverConfig({ ...base, connectionString: 'libsql://db-org.turso.io?authToken=t' })
    expect(cfg).toMatchObject({ host: 'libsql://db-org.turso.io', password: 't' })
    expect(() => buildDriverConfig(base)).toThrow(DriverError)
  })

  it('maps client errors to normalised codes', () => {
    expect(mapTursoError(libsqlError('SERVER_ERROR', 'Server returned HTTP status 401')).code).toBe('auth')
    expect(mapTursoError(libsqlError('SQLITE_CONSTRAINT_UNIQUE', 'UNIQUE failed')).code).toBe('constraint')
    expect(mapTursoError(new Error('fetch failed')).code).toBe('network')
    expect(mapTursoError(new Error('SQLite error: no such table: x')).code).toBe('syntax')
  })

  it('reports an unreachable server as a network error', async () => {
    const driver = await createTursoDriver({ id: 't', dialect: 'sqlite', host: 'http://127.0.0.1:1' })
    await expect(driver.testConnection()).rejects.toMatchObject({ code: 'network' })
    await driver.close()
  })
})
