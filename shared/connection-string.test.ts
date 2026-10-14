import { describe, expect, it } from 'vitest'
import { ConnectionStringError, parseConnectionString } from './connection-string'

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
