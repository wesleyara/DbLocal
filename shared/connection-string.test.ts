import { describe, expect, it } from 'vitest'
import { ConnectionStringError, connectionNameFor, detectDialect, parseConnectionString } from './connection-string'

describe('parseConnectionString', () => {
  it('parses postgres URLs, decoding credentials', () => {
    expect(parseConnectionString('postgres', 'postgresql://app:p%40ss@db.local:6543/shop')).toEqual({
      host: 'db.local',
      port: 6543,
      user: 'app',
      password: 'p@ss',
      database: 'shop',
      sslMode: undefined,
    })
  })

  it('maps sslmode onto SSL modes', () => {
    expect(parseConnectionString('postgres', 'postgres://h/db?sslmode=verify-full').sslMode).toBe('verify-full')
    expect(parseConnectionString('postgres', 'postgres://h/db?sslmode=prefer').sslMode).toBe('require')
    expect(parseConnectionString('mysql', 'mysql://h/db?sslmode=disable').sslMode).toBe('disable')
  })

  it('parses mysql URLs without optional parts', () => {
    expect(parseConnectionString('mysql', 'mysql://127.0.0.1')).toMatchObject({
      host: '127.0.0.1',
      port: undefined,
      database: undefined,
    })
  })

  it('parses sqlite paths with or without the scheme', () => {
    expect(parseConnectionString('sqlite', 'sqlite:///data/app.db')).toEqual({ filePath: '/data/app.db' })
    expect(parseConnectionString('sqlite', './app.db')).toEqual({ filePath: './app.db' })
  })

  it('rejects a URL of another dialect', () => {
    expect(() => parseConnectionString('mysql', 'postgres://h/db')).toThrow(ConnectionStringError)
  })

  it('rejects malformed input', () => {
    expect(() => parseConnectionString('postgres', 'not a url')).toThrow(ConnectionStringError)
  })
})

describe('detectDialect / connectionNameFor', () => {
  it('detects the dialect from the scheme', () => {
    expect(detectDialect('postgres://u@h/db')).toBe('postgres')
    expect(detectDialect('postgresql://u@h/db')).toBe('postgres')
    expect(detectDialect('mysql://u@h/db')).toBe('mysql')
    expect(detectDialect('libsql://db-org.turso.io?authToken=x')).toBe('sqlite')
    expect(detectDialect('./data/app.sqlite')).toBe('sqlite')
    expect(detectDialect('sqlite:///tmp/a.db')).toBe('sqlite')
  })

  it('rejects unknown schemes', () => {
    expect(() => detectDialect('mongodb://h/db')).toThrow(ConnectionStringError)
  })

  it('names connections without leaking the password', () => {
    const parsed = parseConnectionString('postgres', 'postgres://app:secret@db.local:6543/shop')
    const name = connectionNameFor('postgres', parsed)
    expect(name).toBe('shop@db.local:6543')
    expect(name).not.toContain('secret')
    expect(connectionNameFor('sqlite', { filePath: '/tmp/x/app.sqlite' })).toBe('app.sqlite')
  })
})
