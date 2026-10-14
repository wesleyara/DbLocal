import { describe, expect, it } from 'vitest'
import { DriverError } from './errors'
import { mapMysqlError } from './mysql'
import { mapPostgresError } from './postgres'
import { mapSqliteError } from './sqlite'
import { mapSshError } from './ssh-tunnel'

const withCode = (code: string, message = 'x') => Object.assign(new Error(message), { code })

describe('driver error mapping', () => {
  it('maps postgres SQLSTATE and socket codes', () => {
    expect(mapPostgresError(withCode('28P01')).code).toBe('auth')
    expect(mapPostgresError(withCode('ENOTFOUND')).code).toBe('network')
    expect(mapPostgresError(new Error('Connection terminated due to connection timeout')).code).toBe('timeout')
    expect(mapPostgresError(withCode('42601')).code).toBe('syntax')
    expect(mapPostgresError(withCode('23505')).code).toBe('constraint')
    expect(mapPostgresError(withCode('42501')).code).toBe('permission')
    expect(mapPostgresError(new Error('boom')).code).toBe('unknown')
  })

  it('maps mysql error names and socket codes', () => {
    expect(mapMysqlError(withCode('ER_ACCESS_DENIED_ERROR')).code).toBe('auth')
    expect(mapMysqlError(withCode('EAI_AGAIN')).code).toBe('network')
    expect(mapMysqlError(withCode('ETIMEDOUT', 'connect ETIMEDOUT')).code).toBe('timeout')
    expect(mapMysqlError(withCode('ER_DUP_ENTRY')).code).toBe('constraint')
    expect(mapMysqlError(withCode('ER_TABLEACCESS_DENIED_ERROR')).code).toBe('permission')
  })

  it('maps sqlite result codes', () => {
    expect(mapSqliteError(withCode('SQLITE_CANTOPEN')).code).toBe('permission')
    expect(mapSqliteError(withCode('SQLITE_BUSY')).code).toBe('timeout')
    expect(mapSqliteError(withCode('SQLITE_CONSTRAINT_UNIQUE')).code).toBe('constraint')
    expect(mapSqliteError(withCode('SQLITE_ERROR', 'no such table')).code).toBe('unknown')
  })

  it('maps ssh authentication and handshake failures', () => {
    const auth = Object.assign(new Error('All configured authentication methods failed'), {
      level: 'client-authentication',
    })
    expect(mapSshError(auth).code).toBe('auth')
    expect(mapSshError(new Error('Timed out while waiting for handshake')).code).toBe('timeout')
    expect(mapSshError(withCode('ECONNREFUSED')).code).toBe('network')
  })

  it('keeps the HTTP status of each code', () => {
    expect(new DriverError('auth', 'x').httpStatus).toBe(401)
    expect(new DriverError('network', 'x').httpStatus).toBe(502)
  })
})
