import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { QueryFn } from './common'
import { introspectSqlite } from './sqlite'

function queryOf(db: Database.Database): QueryFn {
  return async <R>(sql: string) => db.prepare(sql).all() as R[]
}

describe('SQLite implicit rowid', () => {
  it('keys a rowid table without a PK by its implicit rowid, and flags it', async () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE logs (msg TEXT); CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT);')
    const snap = await introspectSqlite(queryOf(db), 'main')
    const logs = snap.tables.find((t) => t.name === 'logs')!
    expect(logs).toMatchObject({ primaryKey: ['rowid'], implicitRowid: true })
    expect(logs.columns.map((c) => c.name)).toEqual(['msg'])
    expect(snap.tables.find((t) => t.name === 'kv')).toMatchObject({ primaryKey: ['k'], implicitRowid: false })
  })
})
