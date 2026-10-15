import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Driver, DriverConfig } from '../drivers'
import { createDriver } from '../drivers'

/**
 * Raw query sessions against the dev databases (`pnpm db:up`). Opt-in: DBLOCAL_DEV_DB=1.
 * The readonly checks go straight to the session, so they prove the database enforces it
 * even if the statement classifier were fooled.
 */
const enabled = process.env.DBLOCAL_DEV_DB === '1'

interface Target {
  name: string
  config: DriverConfig
  schema: string
  sleep: string
  series: (n: number) => string
  scratch: string
  quote: (id: string) => string
}

const targets: Target[] = [
  {
    name: 'postgres',
    config: { id: 'raw-pg', dialect: 'postgres', host: '127.0.0.1', port: 54329, user: 'dblocal', password: 'dblocal', database: 'dblocal_dev' },
    schema: 'public',
    sleep: 'select pg_sleep(60)',
    series: (n) => `select g as n from generate_series(1, ${n}) g`,
    scratch: 'dblocal_raw_scratch',
    quote: (id) => `"${id}"`,
  },
  {
    name: 'mysql',
    config: { id: 'raw-my', dialect: 'mysql', host: '127.0.0.1', port: 33069, user: 'dblocal', password: 'dblocal', database: 'dblocal_dev' },
    schema: 'dblocal_dev',
    sleep: 'select sleep(60)',
    series: (n) => `with recursive s(n) as (select 1 union all select n + 1 from s where n < ${n}) select n from s`,
    scratch: 'dblocal_raw_scratch',
    quote: (id) => `\`${id}\``,
  },
]

describe.skipIf(!enabled)('raw query sessions on dev databases', () => {
  for (const t of targets) {
    describe(t.name, () => {
      let driver: Driver

      beforeAll(async () => {
        driver = await createDriver(t.config)
        const s = await driver.openQuerySession({ schema: t.schema, readonly: false })
        await s.run(`drop table if exists ${t.quote(t.scratch)}`, 10)
        await s.run(`create table ${t.quote(t.scratch)} (id integer primary key, label varchar(20))`, 10)
        await s.close()
      })

      afterAll(async () => {
        const s = await driver.openQuerySession({ schema: t.schema, readonly: false })
        await s.run(`drop table if exists ${t.quote(t.scratch)}`, 10)
        await s.close()
        await driver.close()
      })

      it('returns typed columns, rows and the truncation flag', async () => {
        const s = await driver.openQuerySession({ schema: t.schema, readonly: false })
        try {
          const out = await s.run(t.series(50), 10)
          expect(out.columns).toHaveLength(1)
          expect(out.columns[0]!.name).toBe('n')
          expect(out.rows).toHaveLength(10)
          expect(out.truncated).toBe(true)
          const all = await s.run(t.series(5), 10)
          expect(all.truncated).toBe(false)
          expect(all.rows).toHaveLength(5)
        } finally {
          await s.close()
        }
      })

      it('keeps columns that share a name', async () => {
        const s = await driver.openQuerySession({ schema: t.schema, readonly: false })
        try {
          const out = await s.run('select 1 as id, 2 as id', 10)
          expect(out.columns.map((c) => c.name)).toEqual(['id', 'id'])
          expect(out.rows).toEqual([[1, 2]])
        } finally {
          await s.close()
        }
      })

      it('reports affected rows for writes', async () => {
        const s = await driver.openQuerySession({ schema: t.schema, readonly: false })
        try {
          const ins = await s.run(`insert into ${t.quote(t.scratch)} values (1, 'a'), (2, 'b')`, 10)
          expect(ins.affectedRows).toBe(2)
          const del = await s.run(`delete from ${t.quote(t.scratch)}`, 10)
          expect(del.affectedRows).toBe(2)
        } finally {
          await s.close()
        }
      })

      it('cancels a 60 s sleep', async () => {
        const s = await driver.openQuerySession({ schema: t.schema, readonly: false })
        try {
          const started = performance.now()
          const pending = s.run(t.sleep, 10)
          // The session may take a moment to reach the server, so cancel when it has.
          await new Promise((r) => setTimeout(r, 300))
          await s.cancel()
          if (t.name === 'mysql') {
            // MySQL's SLEEP returns 1 when interrupted instead of failing.
            await pending.catch(() => {})
          } else {
            await expect(pending).rejects.toBeTruthy()
          }
          expect(performance.now() - started).toBeLessThan(10_000)
          // The connection is usable afterwards.
          expect((await s.run('select 1 as ok', 10)).rows).toEqual([[1]])
        } finally {
          await s.close()
        }
      }, 30_000)

      it('blocks writes and DDL in a read-only session', async () => {
        const s = await driver.openQuerySession({ schema: t.schema, readonly: true })
        try {
          await expect(s.run(`insert into ${t.quote(t.scratch)} values (9, 'x')`, 10)).rejects.toBeTruthy()
          await expect(s.run(`update ${t.quote(t.scratch)} set label = 'y'`, 10)).rejects.toBeTruthy()
          await expect(s.run(`create table ${t.quote('dblocal_raw_ro')} (a integer)`, 10)).rejects.toBeTruthy()
        } finally {
          await s.close()
        }
        const check = await driver.openQuerySession({ schema: t.schema, readonly: false })
        try {
          expect((await check.run(`select count(*) from ${t.quote(t.scratch)}`, 10)).rows[0]![0]).toEqual(expect.anything())
          const out = await check.run(`select * from ${t.quote(t.scratch)}`, 10)
          expect(out.rows).toHaveLength(0)
        } finally {
          await check.close()
        }
      })

      it('carries SET / USE across statements of one session', async () => {
        const s = await driver.openQuerySession({ schema: t.schema, readonly: false })
        try {
          const set = t.name === 'postgres' ? "set application_name = 'dbl_raw'" : "set @dbl = 'raw'"
          const get = t.name === 'postgres' ? "select current_setting('application_name') as v" : 'select @dbl as v'
          await s.run(set, 1)
          expect((await s.run(get, 1)).rows).toEqual([[t.name === 'postgres' ? 'dbl_raw' : 'raw']])
        } finally {
          await s.close({ discard: true })
        }
      })
    })
  }
})
