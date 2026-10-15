import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createConnection } from '../connections/repository'
import { getPoolManager } from '../drivers'
import { migrateStore, openStore, type StoreSchema } from '../store/db'
import { setSecretKey } from '../utils/secrets'
import { explainQuery } from './explain-service'
import { streamQueryExport, streamTableExport, type ExportSink } from './export-service'
import { runRawQuery } from './raw-query-service'
import {
  clearHistory,
  createSavedQuery,
  deleteSavedQuery,
  listHistory,
  listSavedQueries,
  setHistoryRetention,
  updateSavedQuery,
} from './saved-queries-service'

let dir: string
let db: Kysely<StoreSchema>
let connId: string

const sinkOf = (): ExportSink & { text: () => string } => {
  const chunks: string[] = []
  return { write: async (c) => void chunks.push(c), aborted: () => false, text: () => chunks.join('') }
}

beforeAll(async () => {
  setSecretKey(Buffer.alloc(32, 9))
  dir = mkdtempSync(join(tmpdir(), 'dbl-sq-'))
  const file = join(dir, 'x.sqlite')
  const seed = new Database(file)
  seed.exec(`
    create table people (id integer primary key, name text not null, age integer);
    with recursive n(i) as (select 1 union all select i + 1 from n where i < 2500)
      insert into people select i, 'p' || i, i % 90 from n;
  `)
  seed.close()
  db = openStore(dir)
  await migrateStore(db)
  connId = (
    await createConnection(db, {
      name: 'x',
      dialect: 'sqlite',
      filePath: file,
      ssl: { mode: 'disable' },
      environment: 'local',
      readonly: false,
    })
  ).id
})

afterAll(async () => {
  await getPoolManager().closeAll()
  await db.destroy()
  rmSync(dir, { recursive: true, force: true })
})

describe('saved queries', () => {
  it('creates, lists, renames and deletes', async () => {
    const q = await createSavedQuery(db, { name: 'all', sql: 'select 1', connectionId: connId, folder: 'reports' })
    await createSavedQuery(db, { name: 'global', sql: 'select 2' })
    expect((await listSavedQueries(db, connId)).map((s) => s.name).sort()).toEqual(['all', 'global'])
    const renamed = await updateSavedQuery(db, q.id, { name: 'everything', sql: 'select 3' })
    expect(renamed).toMatchObject({ name: 'everything', sql: 'select 3', folder: 'reports', connectionId: connId })
    await deleteSavedQuery(db, q.id)
    await expect(deleteSavedQuery(db, q.id)).rejects.toMatchObject({ status: 404 })
  })

  it('refuses an unknown connection', async () => {
    await expect(createSavedQuery(db, { name: 'n', sql: 's', connectionId: 'nope' })).rejects.toMatchObject({ status: 404 })
  })
})

describe('history', () => {
  it('filters by text and status, and prunes to the retention', async () => {
    await clearHistory(db)
    await runRawQuery(db, connId, { sql: 'select 1 as marker_one' })
    await runRawQuery(db, connId, { sql: 'select * from missing_table' })
    expect((await listHistory(db, { q: 'marker_one' })).entries).toHaveLength(1)
    const failed = await listHistory(db, { status: 'error', connectionId: connId })
    expect(failed.total).toBe(1)
    expect(failed.entries[0]?.error).toBeTruthy()
    await setHistoryRetention(db, 10)
    for (let i = 0; i < 12; i++) await runRawQuery(db, connId, { sql: `select ${i}` })
    expect((await listHistory(db, {})).total).toBe(10)
    expect(await clearHistory(db, connId)).toBe(10)
  })

  it('matches % and _ literally', async () => {
    await clearHistory(db)
    await runRawQuery(db, connId, { sql: "select 'a%b' as pct" })
    expect((await listHistory(db, { q: 'a%b' })).total).toBe(1)
    expect((await listHistory(db, { q: 'a_b' })).total).toBe(0)
  })
})

describe('explain', () => {
  it('returns a plan tree for SQLite', async () => {
    const res = await explainQuery(db, connId, { sql: 'select * from people where id = 5' })
    expect(res.dialect).toBe('sqlite')
    expect(res.plan?.label).toMatch(/SEARCH|SCAN/)
    expect(res.raw).toContain('people')
  })

  it('refuses analyze on SQLite and several statements', async () => {
    await expect(explainQuery(db, connId, { sql: 'select 1', analyze: true })).rejects.toMatchObject({ status: 400 })
    await expect(explainQuery(db, connId, { sql: 'select 1; select 2' })).rejects.toMatchObject({ status: 400 })
  })
})

describe('export', () => {
  it('streams a whole result past the grid limit as CSV', async () => {
    const sink = sinkOf()
    const n = await streamQueryExport(db, connId, { sql: 'select id, name from people order by id', format: 'csv' }, sink)
    expect(n).toBe(2500)
    const lines = sink.text().replace('﻿', '').trim().split('\r\n')
    expect(lines[0]).toBe('id,name')
    expect(lines).toHaveLength(2501)
    expect(lines.at(-1)).toBe('2500,p2500')
  })

  it('caps rows with limit and writes valid JSON', async () => {
    const sink = sinkOf()
    const n = await streamQueryExport(db, connId, { sql: 'select id from people', format: 'json', limit: 700 }, sink)
    expect(n).toBe(700)
    expect(JSON.parse(sink.text())).toHaveLength(700)
  })

  it('writes an empty result as an empty JSON array', async () => {
    const sink = sinkOf()
    await streamQueryExport(db, connId, { sql: 'select id from people where id < 0', format: 'json' }, sink)
    expect(JSON.parse(sink.text())).toEqual([])
  })

  it('refuses writes', async () => {
    await expect(
      streamQueryExport(db, connId, { sql: 'delete from people', format: 'csv' }, sinkOf()),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('streams a table with filter and sort', async () => {
    const sink = sinkOf()
    const n = await streamTableExport(
      db,
      connId,
      'people',
      {
        schema: 'main',
        format: 'json',
        filter: { type: 'condition', column: 'age', op: 'eq', value: 5 },
        sort: [{ column: 'id', direction: 'desc' }],
        columns: ['id', 'age'],
      },
      sink,
    )
    const rows = JSON.parse(sink.text()) as { id: number; age: number }[]
    expect(rows.length).toBe(n)
    expect(n).toBeGreaterThan(20)
    expect(rows.every((r) => r.age === 5)).toBe(true)
    expect(rows[0]!.id).toBeGreaterThan(rows.at(-1)!.id)
  })
})
