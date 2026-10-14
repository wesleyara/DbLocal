import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Driver } from '../drivers'
import { createSqliteDriver } from '../drivers/sqlite'
import type { FilterNode, RowsPlan } from '#shared/types/rows'
import { planRows } from './plan'
import { serializeRow } from './serialize'

/** Runs the real SQLite driver against a throw-away file: the SQL is executed, not just compiled. */
let dir: string
let driver: Driver

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dblocal-rows-'))
  const file = join(dir, 'shop.sqlite')
  const db = new Database(file)
  db.exec(`
    create table customers (id integer primary key, name text not null, vip boolean not null default 0, created_at text);
    insert into customers (id, name, vip, created_at) values
      (1, 'Ana Souza', 1, '2026-01-02T10:00:00.000Z'),
      (2, 'bruno 50% off', 0, null),
      (3, 'Carla_1', 1, '2026-03-04T10:00:00.000Z'),
      (4, '', 0, '2026-05-06T10:00:00.000Z'),
      (5, 'Dani', 0, null);
    create table tags (label text, value text);
    insert into tags values ('a', 'x'), ('b', 'y');
  `)
  db.close()
  driver = await createSqliteDriver({ id: 't', dialect: 'sqlite', filePath: file })
})

afterAll(async () => {
  await driver?.close()
  rmSync(dir, { recursive: true, force: true })
})

async function page(table: string, filter: FilterNode | null = null, extra: Partial<RowsPlan> = {}) {
  const snapshot = await driver.introspect('main')
  const plan = planRows(snapshot, table, {
    schema: 'main',
    filter,
    sort: extra.sort ? extra.sort.map((s) => ({ column: s.column, direction: s.direction })) : [],
    limit: extra.limit ?? 100,
    offset: extra.offset ?? 0,
  })
  return { plan, rows: await driver.readRows(plan) }
}

const ids = (rows: Record<string, unknown>[]) => rows.map((r) => r.id)

describe('SQLite row reads', () => {
  it('returns rows sorted by the primary key by default', async () => {
    const { rows } = await page('customers')
    expect(ids(rows)).toEqual([1, 2, 3, 4, 5])
  })

  it('pages with limit and offset in primary key order', async () => {
    const { rows } = await page('customers', null, { limit: 2, offset: 2 })
    expect(ids(rows)).toEqual([3, 4])
  })

  it('filters with eq, neq, gt and between', async () => {
    expect(ids((await page('customers', { type: 'condition', column: 'id', op: 'gt', value: 3 })).rows)).toEqual([4, 5])
    expect(ids((await page('customers', { type: 'condition', column: 'id', op: 'neq', value: 1 })).rows)).toEqual([2, 3, 4, 5])
    expect(
      ids((await page('customers', { type: 'condition', column: 'id', op: 'between', value: [2, 4] })).rows),
    ).toEqual([2, 3, 4])
  })

  it('contains is case-insensitive and treats % and _ as text', async () => {
    const ana = await page('customers', { type: 'condition', column: 'name', op: 'contains', value: 'ANA' })
    expect(ids(ana.rows)).toEqual([1])
    const percent = await page('customers', { type: 'condition', column: 'name', op: 'contains', value: '50%' })
    expect(ids(percent.rows)).toEqual([2])
    const underscore = await page('customers', { type: 'condition', column: 'name', op: 'contains', value: '_1' })
    expect(ids(underscore.rows)).toEqual([3])
  })

  it('starts_with and ends_with', async () => {
    const start = await page('customers', { type: 'condition', column: 'name', op: 'starts_with', value: 'Da' })
    expect(ids(start.rows)).toEqual([5])
    const end = await page('customers', { type: 'condition', column: 'name', op: 'ends_with', value: 'off' })
    expect(ids(end.rows)).toEqual([2])
  })

  it('is_null and is_not_null tell NULL from the empty string', async () => {
    const nulls = await page('customers', { type: 'condition', column: 'created_at', op: 'is_null' })
    expect(ids(nulls.rows)).toEqual([2, 5])
    const empty = await page('customers', { type: 'condition', column: 'name', op: 'eq', value: '' })
    expect(ids(empty.rows)).toEqual([4])
  })

  it('is_true and is_false on a boolean stored as integer', async () => {
    expect(ids((await page('customers', { type: 'condition', column: 'vip', op: 'is_true' })).rows)).toEqual([1, 3])
    expect(ids((await page('customers', { type: 'condition', column: 'vip', op: 'is_false' })).rows)).toEqual([2, 4, 5])
  })

  it('applies nested AND / OR groups', async () => {
    const filter: FilterNode = {
      type: 'group',
      logic: 'and',
      children: [
        { type: 'condition', column: 'vip', op: 'is_true' },
        {
          type: 'group',
          logic: 'or',
          children: [
            { type: 'condition', column: 'name', op: 'starts_with', value: 'Ana' },
            { type: 'condition', column: 'name', op: 'starts_with', value: 'Carla' },
          ],
        },
      ],
    }
    expect(ids((await page('customers', filter)).rows)).toEqual([1, 3])
  })

  it('treats an injection payload as a plain value', async () => {
    const payload = "x' or '1'='1"
    const { rows } = await page('customers', { type: 'condition', column: 'name', op: 'eq', value: payload })
    expect(rows).toEqual([])
    const stillThere = await driver.countRows(
      planRows(await driver.introspect('main'), 'customers', { schema: 'main', filter: null, sort: [], limit: 1, offset: 0 }),
    )
    expect(stillThere).toBe(5)
  })

  it('counts with the same filter', async () => {
    const snapshot = await driver.introspect('main')
    const plan = planRows(snapshot, 'customers', {
      schema: 'main',
      filter: { type: 'condition', column: 'vip', op: 'is_true' },
      sort: [],
      limit: 1,
      offset: 0,
    })
    expect(await driver.countRows(plan)).toBe(2)
  })

  it('sorts by a requested column, then by the primary key', async () => {
    const { rows } = await page('customers', null, { sort: [{ column: 'vip', direction: 'desc' }] as RowsPlan['sort'] })
    expect(ids(rows)).toEqual([1, 3, 2, 4, 5])
  })

  it('serialises the values the grid receives', () => {
    expect(serializeRow({ n: 1n, when: new Date('2026-01-02T00:00:00.000Z'), blob: new Uint8Array([1, 2, 3]) })).toEqual({
      n: '1',
      when: '2026-01-02T00:00:00.000Z',
      blob: { $binary: 'AQID', size: 3, truncated: false },
    })
  })
})
