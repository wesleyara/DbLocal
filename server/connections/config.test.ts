import { describe, expect, it } from 'vitest'
import { buildDriverConfig } from './config'
import { DriverError } from '../drivers/errors'

describe('buildDriverConfig', () => {
  it('explicit fields win over the connection string', () => {
    const config = buildDriverConfig({
      dialect: 'postgres',
      connectionString: 'postgres://u:pw@old-host:5432/db',
      host: 'new-host',
      ssl: { mode: 'disable' },
    })
    expect(config).toMatchObject({ host: 'new-host', user: 'u', password: 'pw', database: 'db' })
  })

  it('takes the SSL mode from sslmode when the form left it at disable', () => {
    const config = buildDriverConfig({
      dialect: 'postgres',
      connectionString: 'postgres://u@h/db?sslmode=verify-full',
      ssl: { mode: 'disable' },
    })
    expect(config.ssl?.mode).toBe('verify-full')
  })

  it('carries SSL material and an SSH tunnel config when enabled', () => {
    const config = buildDriverConfig({
      dialect: 'mysql',
      host: 'db',
      port: 3306,
      ssl: { mode: 'verify-ca', ca: 'CA' },
      ssh: { enabled: true, host: 'bastion', user: 'ops', authMethod: 'password', password: 'pw' },
    })
    expect(config.ssl).toEqual({ mode: 'verify-ca', ca: 'CA' })
    expect(config.ssh).toEqual({ host: 'bastion', port: 22, user: 'ops', authMethod: 'password', password: 'pw' })
  })

  it('does not build an SSH config when the tunnel is disabled', () => {
    const config = buildDriverConfig({
      dialect: 'postgres',
      host: 'db',
      ssl: { mode: 'disable' },
      ssh: { enabled: false, host: 'bastion', user: 'ops', authMethod: 'password' },
    })
    expect(config.ssh).toBeUndefined()
  })

  it('requires a host, a file path and SSH fields when they apply', () => {
    expect(() => buildDriverConfig({ dialect: 'mysql', ssl: { mode: 'disable' } })).toThrow(DriverError)
    expect(() => buildDriverConfig({ dialect: 'sqlite', ssl: { mode: 'disable' } })).toThrow(DriverError)
    expect(() =>
      buildDriverConfig({
        dialect: 'postgres',
        host: 'db',
        ssl: { mode: 'disable' },
        ssh: { enabled: true, host: 'bastion', authMethod: 'password' },
      }),
    ).toThrow(DriverError)
    expect(() =>
      buildDriverConfig({
        dialect: 'postgres',
        host: 'db',
        ssl: { mode: 'disable' },
        ssh: { enabled: true, host: 'bastion', user: 'ops', authMethod: 'key' },
      }),
    ).toThrow(DriverError)
  })
})
