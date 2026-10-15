import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SchemaSnapshot } from '#shared/types/db'
import type { SearchEvent } from '#shared/types/search'
import { createSqliteDriver } from '../drivers/sqlite'
import type { Driver } from '../drivers'

let dir: string
let driver: Driver
let snapshot: SchemaSnapshot

vi.mock('../schema/service', () => ({
  readSchema: async () => ({ snapshot, graph: null }),
  connectionDriver: async () => driver,
}))

const { searchData, planTableSearch, conditionFor } = await import('./search-service')

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dblocal-search-'))
  const file = join(dir, 'search.sqlite')
  const db = new Database(file)
  db.exec(`
    create table users (id integer primary key, email text not null, name text);
    insert into users values (1, 'ana@example.com', 'Ana'), (2, 'bruno@example.com', 'Bruno'), (3, 'carla@other.org', 'Carla');
    create table orders (id integer primary key, user_id integer, note text);
    insert into orders values (10, 1, 'ana@example.com asked for a refund'), (11, 2, 'ok');
    create table blobs (id integer primary key, data blob);
  `)
  db.close()
  driver = await createSqliteDriver({ id: 't', dialect: 'sqlite', filePath: file })
  snapshot = await driver.introspect('main')
})

afterAll(async () => {
  await driver?.close()
  rmSync(dir, { recursive: true, force: true })
})

async function collect(req: Partial<Parameters<typeof searchData>[2]>, signal?: AbortSignal): Promise<SearchEvent[]> {
  const events: SearchEvent[] = []
  await searchData({} as never, 'c', { schema: 'main', term: 'x', mode: 'exact', ...req }, (e) => void events.push(e), signal)
  return events
}

describe('conditionFor', () => {
  it('compares text exactly or by substring', () => {
    expect(conditionFor({ name: 'a', kind: 'string' }, 'x', 'exact')).toMatchObject({ op: 'eq' })
    expect(conditionFor({ name: 'a', kind: 'string' }, 'x', 'contains')).toMatchObject({ op: 'contains' })
  })
  it('only compares numbers with numeric terms and uuids with whole uuids', () => {
    expect(conditionFor({ name: 'a', kind: 'number' }, '42', 'exact')).toMatchObject({ op: 'eq', value: 42 })
    expect(conditionFor({ name: 'a', kind: 'number' }, 'abc', 'exact')).toBeNull()
    expect(conditionFor({ name: 'a', kind: 'uuid' }, 'abc', 'contains')).toBeNull()
    expect(conditionFor({ name: 'a', kind: 'binary' }, 'abc', 'exact')).toBeNull()
  })
})

describe('searchData (SQLite)', () => {
  it('finds an e-mail in the right tables and reports the columns compared', async () => {
    const events = await collect({ term: 'ana@example.com', mode: 'exact' })
    const hits = events.filter((e) => e.type === 'table')
    expect(hits.map((h) => h.type === 'table' && h.table)).toEqual(['users'])
    const users = hits[0]!
    expect(users.type === 'table' && users.rows.map((r) => r.id)).toEqual([1])
    expect(events.at(-1)).toMatchObject({ type: 'done', cancelled: false })
  })

  it('contains is case-insensitive and spans tables', async () => {
    const events = await collect({ term: 'ANA@', mode: 'contains' })
    const tables = events.flatMap((e) => (e.type === 'table' ? [e.table] : [])).sort()
    expect(tables).toEqual(['orders', 'users'])
  })

  it('searches numeric ids in number columns', async () => {
    const events = await collect({ term: '10', mode: 'exact' })
    const orders = events.find((e) => e.type === 'table' && e.table === 'orders')
    expect(orders && orders.type === 'table' && orders.rows.map((r) => r.id)).toEqual([10])
  })

  it('caps rows per table and flags truncation', async () => {
    const events = await collect({ term: 'example.com', mode: 'contains', limitPerTable: 1 })
    const users = events.find((e) => e.type === 'table' && e.table === 'users')
    expect(users && users.type === 'table' && [users.rows.length, users.truncated]).toEqual([1, true])
  })

  it('honours a table filter and skips tables that cannot match', async () => {
    const events = await collect({ term: 'ana', mode: 'contains', tables: ['users', 'blobs'] })
    expect(events[0]).toEqual({ type: 'start', tables: 1 })
    expect(events.at(-1)).toMatchObject({ type: 'done', skipped: 1 })
  })

  it('stops starting tables once cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const events = await collect({ term: 'ana', mode: 'contains' }, controller.signal)
    expect(events.some((e) => e.type === 'table')).toBe(false)
    expect(events.at(-1)).toMatchObject({ type: 'done', cancelled: true })
  })
})

describe('planTableSearch', () => {
  it('returns null for a table with nothing comparable', () => {
    const blobs = snapshot.tables.find((t) => t.name === 'blobs')!
    expect(planTableSearch(blobs, 'abc', 'contains')).toBeNull()
  })
})
