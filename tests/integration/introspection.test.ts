import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SchemaSnapshot } from '#shared/types/db'
import type { Driver, DriverConfig } from '../../server/drivers'
import { createDriver } from '../../server/drivers'
import { buildRelationGraph } from '../../server/schema/relation-graph'

// Same dev containers as drivers.test.ts (`pnpm db:up && pnpm db:seed`).
const PG: DriverConfig = { id: 'pg-intro', dialect: 'postgres', host: '127.0.0.1', port: 54329, user: 'dblocal', password: 'dblocal', database: 'dblocal_dev' }
const MY: DriverConfig = { id: 'my-intro', dialect: 'mysql', host: '127.0.0.1', port: 33069, user: 'dblocal', password: 'dblocal', database: 'dblocal_dev' }
const SQLITE: DriverConfig = { id: 'sq-intro', dialect: 'sqlite', filePath: join(process.cwd(), 'fixtures/dev.sqlite') }

/** Stable signature of the physical relations, so the three seeds can be compared. */
function signature(snap: SchemaSnapshot): string[] {
  const graph = buildRelationGraph(snap)
  return graph.relations
    .filter((r) => !r.virtual)
    .map((r) => `${r.from.table}(${r.from.columns.join(',')})->${r.to.table}(${r.to.columns.join(',')}) ${r.cardinality}${r.via ? ` via ${r.via.table}` : ''}`)
    .sort()
}

const CORE_TABLES = ['users', 'profiles', 'categories', 'products', 'tags', 'product_tags', 'orders', 'shipments', 'order_items']

describe('introspection against the dev seeds (postgres, mysql, sqlite)', () => {
  const snapshots: Record<string, SchemaSnapshot> = {}
  const drivers: Driver[] = []

  beforeAll(async () => {
    const targets: [string, DriverConfig, string][] = [
      ['postgres', PG, 'public'],
      ['mysql', MY, 'dblocal_dev'],
      ['sqlite', SQLITE, 'main'],
    ]
    for (const [name, config, schema] of targets) {
      const driver = await createDriver(config)
      drivers.push(driver)
      snapshots[name] = await driver.introspect(schema)
    }
  })

  afterAll(async () => {
    await Promise.all(drivers.map((d) => d.close()))
  })

  it('finds the core tables in every dialect', () => {
    for (const snap of Object.values(snapshots)) {
      const names = snap.tables.map((t) => t.name)
      for (const table of CORE_TABLES) expect(names).toContain(table)
    }
  })

  it('detects the composite FK from order_items to shipments in every dialect', () => {
    for (const snap of Object.values(snapshots)) {
      const items = snap.tables.find((t) => t.name === 'order_items')!
      expect(items.foreignKeys.some((f) => f.columns.length === 2 && f.refTable === 'shipments')).toBe(true)
    }
  })

  it('builds an identical physical relation graph in every dialect', () => {
    const pg = signature(snapshots.postgres!)
    expect(pg.length).toBeGreaterThan(0)
    expect(signature(snapshots.mysql!)).toEqual(pg)
    expect(signature(snapshots.sqlite!)).toEqual(pg)
  })
})
