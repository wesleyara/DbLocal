import { describe, expect, it } from 'vitest'
import type { Driver, DriverConfig } from '../drivers'
import { createDriver } from '../drivers'
import type { RowsPlan } from '#shared/types/rows'
import { planRows } from './plan'

/**
 * Runs the row reads against the dev databases from `docker/compose.dev.yml`. Opt-in: set
 * DBLOCAL_DEV_DB=1 and start them with `pnpm db:up && pnpm db:seed`.
 */
const enabled = process.env.DBLOCAL_DEV_DB === '1'

const targets: { name: string; config: DriverConfig; schema: string }[] = [
  {
    name: 'postgres',
    config: { id: 'dev-pg', dialect: 'postgres', host: '127.0.0.1', port: 54329, user: 'dblocal', password: 'dblocal', database: 'dblocal_dev' },
    schema: 'public',
  },
  {
    name: 'mysql',
    config: { id: 'dev-mysql', dialect: 'mysql', host: '127.0.0.1', port: 33069, user: 'dblocal', password: 'dblocal', database: 'dblocal_dev' },
    schema: 'dblocal_dev',
  },
]

describe.skipIf(!enabled)('row reads on dev databases', () => {
  for (const target of targets) {
    describe(target.name, () => {
      let driver: Driver
      let snapshot: Awaited<ReturnType<Driver['introspect']>>

      const plan = (table: string, over: Partial<RowsPlan> = {}): RowsPlan =>
        planRows(snapshot, table, {
          schema: target.schema,
          filter: over.filter ?? null,
          sort: (over.sort ?? []) as { column: string; direction: 'asc' | 'desc' }[],
          limit: over.limit ?? 50,
          offset: over.offset ?? 0,
        })

      it('connects and introspects', async () => {
        driver = await createDriver(target.config)
        snapshot = await driver.introspect(target.schema)
        expect(snapshot.tables.map((t) => t.name)).toContain('users')
      })

      it('pages through a table in primary key order without overlap', async () => {
        const first = await driver.readRows(plan('users', { limit: 50, offset: 0 }))
        const second = await driver.readRows(plan('users', { limit: 50, offset: 50 }))
        expect(first).toHaveLength(50)
        const firstIds = new Set(first.map((r) => String(r[snapshot.tables.find((t) => t.name === 'users')!.primaryKey[0]!])))
        for (const row of second) {
          expect(firstIds.has(String(row[snapshot.tables.find((t) => t.name === 'users')!.primaryKey[0]!]))).toBe(false)
        }
      })

      it('counts exactly under a filter and matches the rows returned', async () => {
        const users = snapshot.tables.find((t) => t.name === 'users')!
        const nameCol = users.columns.find((c) => c.kind === 'string' && !c.isPrimaryKey)!.name
        const filter = { type: 'condition' as const, column: nameCol, op: 'contains' as const, value: 'a' }
        const count = await driver.countRows(plan('users', { filter }))
        const rows = await driver.readRows(plan('users', { filter, limit: 500 }))
        expect(count).toBe(rows.length)
        expect(count).toBeGreaterThan(0)
      })

      it('returns NULL as null and treats is_null correctly', async () => {
        const profiles = snapshot.tables.find((t) => t.name === 'profiles')
        if (!profiles) return
        const nullable = profiles.columns.find((c) => c.nullable && !c.isPrimaryKey)
        if (!nullable) return
        const filter = { type: 'condition' as const, column: nullable.name, op: 'is_null' as const }
        const rows = await driver.readRows(plan('profiles', { filter, limit: 500 }))
        for (const row of rows) expect(row[nullable.name]).toBeNull()
      })

      it('reads only the requested columns when asked', async () => {
        const users = snapshot.tables.find((t) => t.name === 'users')!
        const cols = users.columns.slice(0, 2).map((c) => c.name)
        const rows = await driver.readRows({ ...plan('users', { limit: 3 }), columns: cols })
        expect(Object.keys(rows[0]!).sort()).toEqual([...cols].sort())
      })

      it('closes the driver', async () => {
        await driver.close()
      })
    })
  }
})
