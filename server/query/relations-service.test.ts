import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Driver } from '../drivers'
import { createSqliteDriver } from '../drivers/sqlite'
import { buildRelationGraph } from '../schema/relation-graph'
import type { RelationGraph, SchemaSnapshot } from '#shared/types/db'
import { planRows } from './plan'
import { resolveRelations, resolveScope, withFilter } from './relations-service'

let dir: string
let driver: Driver
let snapshot: SchemaSnapshot
let graph: RelationGraph
let queries = 0

/** Counts the statements that reach the database, to prove the lookups are batched. */
function counting(inner: Driver): Driver {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (prop === 'readRows' || prop === 'countGroups' || prop === 'countRows') {
        return (...args: unknown[]) => {
          queries++
          return (value as (...a: unknown[]) => unknown).apply(target, args)
        }
      }
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dblocal-rel-'))
  const file = join(dir, 'shop.sqlite')
  const db = new Database(file)
  db.pragma('foreign_keys = off')
  db.exec(`
    create table users (id integer primary key, name text not null);
    create table orders (id integer primary key, user_id integer references users(id), total integer);
    create table products (id integer primary key, title text not null);
    create table tags (id integer primary key, label text not null);
    create table product_tags (
      product_id integer not null references products(id),
      tag_id integer not null references tags(id),
      primary key (product_id, tag_id)
    );
    create table regions (country text, code text, name text, primary key (country, code));
    create table offices (id integer primary key, country text, region_code text, foreign key (country, region_code) references regions(country, code));
    insert into users values (1, 'Ana'), (2, 'Bruno'), (3, 'Carla');
    insert into orders values (1, 1, 10), (2, 1, 20), (3, 2, 30), (4, null, 40), (5, 99, 50);
    insert into products values (1, 'Mug'), (2, 'Pen');
    insert into tags values (1, 'home'), (2, 'office'), (3, 'gift');
    insert into product_tags values (1, 1), (1, 3), (2, 2), (2, 3);
    insert into regions values ('BR', 'SP', 'São Paulo'), ('BR', 'RJ', 'Rio');
    insert into offices values (1, 'BR', 'SP'), (2, 'BR', 'SP'), (3, 'BR', 'RJ');
  `)
  db.close()
  driver = await createSqliteDriver({ id: 't', dialect: 'sqlite', filePath: file })
  snapshot = await driver.introspect('main')
  graph = buildRelationGraph(snapshot, [], {})
})

afterAll(async () => {
  await driver?.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('resolveRelations', () => {
  it('resolves parents with their display label and null / orphan FKs', async () => {
    const { rows } = await resolveRelations(driver, snapshot, graph, 'orders', {
      rows: [{ id: 1 }, { id: 3 }, { id: 4 }, { id: 5 }],
    })
    expect(rows[0]!.parents['orders.user']).toEqual({ key: { id: 1 }, label: 'Ana' })
    expect(rows[1]!.parents['orders.user']).toEqual({ key: { id: 2 }, label: 'Bruno' })
    expect(rows[2]!.parents['orders.user']).toBeNull()
    expect(rows[3]!.parents['orders.user']).toBeNull()
  })

  it('counts 1:N children per row, zero when there are none', async () => {
    const { rows } = await resolveRelations(driver, snapshot, graph, 'users', { rows: [{ id: 1 }, { id: 2 }, { id: 3 }] })
    expect(rows.map((r) => r.counts['users.orders'])).toEqual([2, 1, 0])
  })

  it('counts N:N through the junction in both directions', async () => {
    const products = await resolveRelations(driver, snapshot, graph, 'products', { rows: [{ id: 1 }, { id: 2 }] })
    expect(products.rows.map((r) => r.counts['products.tags'])).toEqual([2, 2])
    const tags = await resolveRelations(driver, snapshot, graph, 'tags', { rows: [{ id: 1 }, { id: 2 }, { id: 3 }] })
    expect(tags.rows.map((r) => r.counts['tags.products'])).toEqual([1, 1, 2])
  })

  it('supports composite foreign keys', async () => {
    const parents = await resolveRelations(driver, snapshot, graph, 'offices', { rows: [{ id: 1 }, { id: 3 }] })
    const name = Object.keys(parents.rows[0]!.parents)[0]!
    expect(parents.rows[0]!.parents[name]!.key).toEqual({ country: 'BR', code: 'SP' })
    expect(parents.rows[1]!.parents[name]!.label).toBe('Rio')
    const children = await resolveRelations(driver, snapshot, graph, 'regions', {
      rows: [{ country: 'BR', code: 'SP' }, { country: 'BR', code: 'RJ' }],
    })
    const rel = Object.keys(children.rows[0]!.counts)[0]!
    expect(children.rows.map((r) => r.counts[rel])).toEqual([2, 1])
  })

  it('uses a bounded number of queries regardless of row count', async () => {
    const counted = counting(driver)
    const keys = Array.from({ length: 100 }, (_, i) => ({ id: (i % 5) + 1 }))
    queries = 0
    await resolveRelations(counted, snapshot, graph, 'orders', { rows: keys })
    // 1 source read + 1 per relation (a single parent relation here).
    expect(queries).toBe(2)
    queries = 0
    await resolveRelations(counted, snapshot, graph, 'users', { rows: keys.slice(0, 3) })
    expect(queries).toBe(2)
  })

  it('rejects unknown relations and tables without a key', async () => {
    await expect(resolveRelations(driver, snapshot, graph, 'orders', { rows: [{ id: 1 }], relations: ['nope'] })).rejects.toThrow(/Unknown relation/)
  })
})

describe('resolveScope', () => {
  async function scoped(table: string, scope: Parameters<typeof resolveScope>[4]) {
    const resolved = await resolveScope(driver, snapshot, graph, table, scope)
    if (resolved.empty) return []
    const plan = {
      ...planRows(snapshot, table, { schema: 'main', filter: withFilter(null, resolved.filter), sort: [], limit: 100, offset: 0 }),
      junction: resolved.junction,
    }
    return (await driver.readRows(plan)).map((r) => r.id)
  }

  it('filters the child table by the origin record', async () => {
    expect(await scoped('orders', { table: 'users', relation: 'users.orders', key: { id: 1 } })).toEqual([1, 2])
    expect(await scoped('orders', { table: 'users', relation: 'users.orders', key: { id: 3 } })).toEqual([])
  })

  it('goes through the junction for N:N, both ways', async () => {
    expect(await scoped('tags', { table: 'products', relation: 'products.tags', key: { id: 1 } })).toEqual([1, 3])
    expect(await scoped('products', { table: 'tags', relation: 'tags.products', key: { id: 3 } })).toEqual([1, 2])
  })

  it('goes to the parent from a many-to-one origin', async () => {
    expect(await scoped('users', { table: 'orders', relation: 'orders.user', key: { id: 3 } })).toEqual([2])
    expect(await scoped('users', { table: 'orders', relation: 'orders.user', key: { id: 4 } })).toEqual([])
  })

  it('rejects a relation that leads elsewhere', async () => {
    await expect(resolveScope(driver, snapshot, graph, 'tags', { table: 'users', relation: 'users.orders', key: { id: 1 } })).rejects.toThrow()
  })
})
