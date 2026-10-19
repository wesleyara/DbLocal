import mysql from 'mysql2/promise'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Driver, DriverConfig } from '../drivers'
import { createDriver } from '../drivers'
import type { MutationOp } from '#shared/types/mutations'
import type { SchemaSnapshot } from '#shared/types/db'
import { planMutations } from './mutation-plan'

/**
 * Runs mutation batches against the dev databases from `docker/compose.dev.yml` on a throw-away
 * table that is dropped afterwards. Opt-in: DBLOCAL_DEV_DB=1 with `pnpm db:up`.
 */
const enabled = process.env.DBLOCAL_DEV_DB === '1'

interface Target {
  name: string
  config: DriverConfig
  schema: string
  /** DDL for the scratch tables, in the dialect's own types. */
  ddl: string[]
  q: (id: string) => string
}

const TABLE = 'dblocal_mut_scratch'
const PAIRS = 'dblocal_mut_pairs'

const targets: Target[] = [
  {
    name: 'postgres',
    config: { id: 'mut-pg', dialect: 'postgres', host: '127.0.0.1', port: 54329, user: 'dblocal', password: 'dblocal', database: 'dblocal_dev' },
    schema: 'public',
    q: (id) => `"${id}"`,
    ddl: [
      `create table "${TABLE}" (id serial primary key, name text not null, age integer, active boolean default false,
         meta jsonb, born date, seen timestamptz, naive timestamp, avatar bytea, role text default 'user', tags text[])`,
      `create table "${PAIRS}" (a integer not null, b integer not null, note text, primary key (a, b))`,
    ],
  },
  {
    name: 'mysql',
    config: { id: 'mut-mysql', dialect: 'mysql', host: '127.0.0.1', port: 33069, user: 'dblocal', password: 'dblocal', database: 'dblocal_dev' },
    schema: 'dblocal_dev',
    q: (id) => `\`${id}\``,
    ddl: [
      `create table \`${TABLE}\` (id int auto_increment primary key, name varchar(100) not null, age int, active boolean default false,
         meta json, born date, seen datetime(3), avatar blob, role varchar(20) default 'user')`,
      `create table \`${PAIRS}\` (a int not null, b int not null, note varchar(50), primary key (a, b))`,
    ],
  },
]

describe.skipIf(!enabled)('mutations on dev databases', () => {
  for (const target of targets) {
    describe(target.name, () => {
      let driver: Driver
      let snapshot: SchemaSnapshot
      const plan = (ops: MutationOp[]) => planMutations(snapshot, ops)
      const count = async () => {
        const rows = await driver.readRows({
          dialect: snapshot.dialect,
          schema: target.schema,
          table: TABLE,
          primaryKey: ['id'],
          columns: null,
          filter: null,
          sort: [{ column: 'id', direction: 'asc' }],
          limit: 500,
          offset: 0,
        })
        return rows
      }

      beforeAll(async () => {
        driver = await createDriver(target.config)
        for (const name of [TABLE, PAIRS]) {
          await rawExec(target, `drop table if exists ${target.q(name)}`)
        }
        for (const sql of target.ddl) await rawExec(target, sql)
        snapshot = await driver.introspect(target.schema)
      })

      afterAll(async () => {
        for (const name of [TABLE, PAIRS]) await rawExec(target, `drop table if exists ${target.q(name)}`)
        await driver.close()
      })

      it('inserts (with DEFAULT), updates and deletes in one transaction and returns the rows', async () => {
        const res = await driver.applyMutations(
          plan([
            { type: 'insert', table: TABLE, values: { name: 'Ana', age: '30', role: { $default: true } } },
            { type: 'insert', table: TABLE, values: { name: 'Bruno' } },
          ]),
        )
        expect(res[0]!.row).toMatchObject({ name: 'Ana', age: 30, role: 'user' })
        const id = res[1]!.row!.id as number
        const [upd, del] = await driver.applyMutations(
          plan([
            { type: 'update', table: TABLE, pk: { id }, values: { age: 41, role: { $default: true } } },
            { type: 'delete', table: TABLE, pk: { id: res[0]!.row!.id as number } },
          ]),
        )
        expect(upd!.row).toMatchObject({ id, age: 41, role: 'user' })
        expect(del!.affected).toBe(1)
        expect((await count()).map((r) => r.name)).toEqual(['Bruno'])
      })

      it('rolls everything back when one operation fails and names it', async () => {
        const before = await count()
        const ops: MutationOp[] = [
          { type: 'insert', table: TABLE, values: { name: 'Temp' } },
          { type: 'update', table: TABLE, pk: { id: before[0]!.id as number }, values: { name: 'Changed' } },
          { type: 'insert', table: TABLE, values: { age: 1 } }, // name is NOT NULL
        ]
        await expect(driver.applyMutations(plan(ops))).rejects.toMatchObject({ index: 2 })
        expect(await count()).toEqual(before)
      })

      it('upserts by the key: inserts, then updates the same row', async () => {
        const res = await driver.applyMutations(
          plan([
            { type: 'upsert', table: PAIRS, values: { a: 5, b: 6, note: 'first' } },
            { type: 'upsert', table: PAIRS, values: { a: 5, b: 6, note: 'second' } },
            { type: 'upsert', table: PAIRS, values: { a: 5, b: 7 } },
          ]),
        )
        expect(res.map((r) => r.row)).toMatchObject([{ note: 'first' }, { note: 'second' }, { a: 5, b: 7, note: null }])
      })

      it('upserts an explicit id into an auto-increment / serial key', async () => {
        const [res] = await driver.applyMutations(plan([{ type: 'upsert', table: TABLE, values: { id: 900, name: 'Imported' } }]))
        expect(res!.row).toMatchObject({ id: 900, name: 'Imported' })
        const [again] = await driver.applyMutations(plan([{ type: 'upsert', table: TABLE, values: { id: 900, name: 'Again' } }]))
        expect(again!.row).toMatchObject({ id: 900, name: 'Again' })
        await driver.applyMutations(plan([{ type: 'delete', table: TABLE, pk: { id: 900 } }]))
      })

      it('reports a stale key', async () => {
        await expect(
          driver.applyMutations(plan([{ type: 'update', table: TABLE, pk: { id: 987654 }, values: { name: 'x' } }])),
        ).rejects.toMatchObject({ index: 0, code: 'constraint' })
      })

      it('round-trips json, dates, booleans and binary', async () => {
        const [res] = await driver.applyMutations(
          plan([
            {
              type: 'insert',
              table: TABLE,
              values: {
                name: 'Types',
                active: true,
                meta: { a: [1, 2], b: 'x' },
                born: '1990-05-06',
                seen: '2026-01-02T03:04:05.000Z',
                ...(target.name === 'postgres' ? { naive: '2026-01-02T03:04:05.000Z', tags: ['a', 'b'] } : {}),
                avatar: { $binary: Buffer.from([0, 1, 2, 255]).toString('base64') },
              },
            },
          ]),
        )
        const row = res!.row!
        expect(row.active === true || row.active === 1).toBe(true)
        const meta = typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta
        expect(meta).toEqual({ a: [1, 2], b: 'x' })
        expect(new Date(row.seen as string | Date).toISOString()).toBe('2026-01-02T03:04:05.000Z')
        expect([...(row.avatar as Uint8Array)]).toEqual([0, 1, 2, 255])
        if (target.name === 'postgres') {
          // `timestamp` has no zone: it reads back as the same instant that was written.
          expect(new Date(row.naive as string | Date).toISOString()).toBe('2026-01-02T03:04:05.000Z')
          expect(row.tags).toEqual(['a', 'b'])
        }
      })

      it('addresses rows by a composite key', async () => {
        const res = await driver.applyMutations(
          plan([
            { type: 'insert', table: PAIRS, values: { a: 1, b: 2, note: 'n' } },
            { type: 'update', table: PAIRS, pk: { a: 1, b: 2 }, values: { note: 'changed' } },
          ]),
        )
        expect(res[1]!.row).toMatchObject({ a: 1, b: 2, note: 'changed' })
      })
    })
  }
})

/** The Driver interface has no raw statement (that is the SQL editor's job): scratch DDL uses the native client. */
async function rawExec(target: Target, sql: string): Promise<void> {
  const c = target.config
  if (c.dialect === 'postgres') {
    const client = new pg.Client({ host: c.host, port: c.port, user: c.user, password: c.password, database: c.database })
    await client.connect()
    try {
      await client.query(sql)
    } finally {
      await client.end()
    }
    return
  }
  const conn = await mysql.createConnection({ host: c.host, port: c.port, user: c.user, password: c.password, database: c.database })
  try {
    await conn.query(sql)
  } finally {
    await conn.end()
  }
}
