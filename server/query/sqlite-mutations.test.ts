import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Driver } from '../drivers'
import { createSqliteDriver } from '../drivers/sqlite'
import type { MutationOp, MutationPlan } from '#shared/types/mutations'
import type { SchemaSnapshot } from '#shared/types/db'
import { editableKey } from '#shared/editable'
import { MutationFailedError } from './errors'
import { previewStatements } from './compile-mutations'
import { planMutations } from './mutation-plan'

/** Runs the real SQLite driver on a throw-away file, so transactions and RETURNING are exercised. */
let dir: string
let driver: Driver
let raw: Database.Database
let snapshot: SchemaSnapshot

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dblocal-mut-'))
  const file = join(dir, 'm.sqlite')
  raw = new Database(file)
  raw.exec(`
    create table people (id integer primary key autoincrement, name text not null, age integer, vip boolean default 0,
      meta json, born date, seen datetime, avatar blob, role text default 'user');
    insert into people (id, name, age) values (1, 'Ana', 30), (2, 'Bruno', 40);
    create table pairs (a integer not null, b integer not null, note text, primary key (a, b));
    create table loose (label text, value text);
    create table slugs (slug text not null, title text);
    create unique index slugs_slug on slugs (slug);
    create table stamps (id integer primary key, at text default 'now');
    create view people_v as select id, name from people;
  `)
  driver = await createSqliteDriver({ id: 't', dialect: 'sqlite', filePath: file })
  snapshot = await driver.introspect('main')
})

afterAll(async () => {
  await driver?.close()
  raw?.close()
  rmSync(dir, { recursive: true, force: true })
})

const plan = (ops: MutationOp[]): MutationPlan => planMutations(snapshot, ops)
const names = () => (raw.prepare('select name from people order by id').all() as { name: string }[]).map((r) => r.name)

describe('editable keys', () => {
  it('uses the primary key, a unique not-null index, or nothing', () => {
    const by = (n: string) => snapshot.tables.find((t) => t.name === n)!
    expect(editableKey(by('people'))).toEqual(['id'])
    expect(editableKey(by('pairs'))).toEqual(['a', 'b'])
    expect(editableKey(by('slugs'))).toEqual(['slug'])
    expect(editableKey(by('loose'))).toBeNull()
    expect(editableKey(by('people_v'))).toBeNull()
  })
})

describe('mutation planning', () => {
  it('rejects views, tables without a key, unknown columns and bad keys with the op index', () => {
    const fails = (ops: MutationOp[], message: RegExp) => {
      try {
        plan(ops)
      } catch (err) {
        expect(err).toBeInstanceOf(MutationFailedError)
        expect((err as Error).message).toMatch(message)
        return (err as MutationFailedError).index
      }
      throw new Error('expected a failure')
    }
    expect(fails([{ type: 'insert', table: 'people_v', values: { name: 'x' } }], /cannot be edited/)).toBe(0)
    expect(fails([{ type: 'delete', table: 'people', pk: { id: 1 } }, { type: 'update', table: 'loose', pk: { label: 'a' }, values: { value: 'z' } }], /no primary key/)).toBe(1)
    expect(fails([{ type: 'insert', table: 'people', values: { nope: 1 } }], /Unknown column/)).toBe(0)
    expect(fails([{ type: 'update', table: 'people', pk: { name: 'Ana' }, values: { age: 1 } }], /must be exactly/)).toBe(0)
    expect(fails([{ type: 'update', table: 'people', pk: { id: 1 }, values: {} }], /at least one value/)).toBe(0)
    expect(fails([{ type: 'insert', table: 'people', values: { age: 'abc' } }], /expects a number/)).toBe(0)
    expect(fails([{ type: 'insert', table: 'nope', values: {} }], /Table not found/)).toBe(0)
  })

  it('compiles parameterised SQL and shows the values inline in the preview', () => {
    const [s] = previewStatements(plan([{ type: 'update', table: 'people', pk: { id: 1 }, values: { name: "O'Neil" } }]))
    expect(s!.sql).toBe('update "main"."people" set "name" = ? where "id" = ? returning *')
    expect(s!.parameters).toEqual(["O'Neil", 1])
    expect(s!.preview).toBe(`update "main"."people" set "name" = 'O''Neil' where "id" = 1 returning *`)
  })
})

describe('SQLite mutations', () => {
  it('inserts, updates and deletes and returns the written rows', async () => {
    const res = await driver.applyMutations(
      plan([
        { type: 'insert', table: 'people', values: { name: 'Carla', age: '25', role: { $default: true } } },
        { type: 'update', table: 'people', pk: { id: 2 }, values: { age: 41 } },
        { type: 'delete', table: 'people', pk: { id: 1 } },
      ]),
    )
    expect(res.map((r) => r.affected)).toEqual([1, 1, 1])
    expect(res[0]!.row).toMatchObject({ name: 'Carla', age: 25, role: 'user' })
    expect(res[1]!.row).toMatchObject({ id: 2, age: 41 })
    expect(res[2]!.row).toBeNull()
    expect(names()).toEqual(['Bruno', 'Carla'])
  })

  it('rolls everything back when one operation fails, naming it', async () => {
    const before = names()
    const ops: MutationOp[] = [
      { type: 'insert', table: 'people', values: { name: 'Temp' } },
      { type: 'update', table: 'people', pk: { id: 2 }, values: { name: 'Changed' } },
      { type: 'insert', table: 'people', values: { age: 3 } }, // name is NOT NULL
    ]
    await expect(driver.applyMutations(plan(ops))).rejects.toMatchObject({ index: 2, code: 'constraint' })
    expect(names()).toEqual(before)
  })

  it('reports a stale key instead of silently doing nothing', async () => {
    await expect(driver.applyMutations(plan([{ type: 'update', table: 'people', pk: { id: 999 }, values: { name: 'x' } }]))).rejects.toMatchObject({
      index: 0,
      code: 'constraint',
    })
  })

  it('round-trips json, dates, booleans and binary', async () => {
    const [res] = await driver.applyMutations(
      plan([
        {
          type: 'insert',
          table: 'people',
          values: {
            name: 'Types',
            vip: true,
            meta: { a: [1, 2], b: 'x' },
            born: '1990-05-06',
            seen: '2026-01-02T03:04:05.000Z',
            avatar: { $binary: Buffer.from([0, 1, 2, 255]).toString('base64') },
          },
        },
      ]),
    )
    const row = raw.prepare('select * from people where id = ?').get(res!.row!.id) as Record<string, unknown>
    expect(row.vip).toBe(1)
    expect(JSON.parse(row.meta as string)).toEqual({ a: [1, 2], b: 'x' })
    expect(row.born).toBe('1990-05-06')
    expect(row.seen).toBe('2026-01-02T03:04:05.000Z')
    expect([...(row.avatar as Buffer)]).toEqual([0, 1, 2, 255])
  })

  it('addresses rows by a composite key and by a unique not-null index', async () => {
    await driver.applyMutations(plan([{ type: 'insert', table: 'pairs', values: { a: 1, b: 2, note: 'n' } }, { type: 'insert', table: 'slugs', values: { slug: 'hi', title: 't' } }]))
    const res = await driver.applyMutations(
      plan([
        { type: 'update', table: 'pairs', pk: { a: 1, b: 2 }, values: { note: 'changed' } },
        { type: 'update', table: 'slugs', pk: { slug: 'hi' }, values: { title: 'T2' } },
      ]),
    )
    expect(res[0]!.row).toMatchObject({ note: 'changed' })
    expect(res[1]!.row).toMatchObject({ title: 'T2' })
  })

  it('inserts a row made only of defaults', async () => {
    const [res] = await driver.applyMutations(plan([{ type: 'insert', table: 'stamps', values: { at: { $default: true } } }]))
    expect(res!.row).toMatchObject({ at: 'now' })
  })
})

describe('increment()', () => {
  it('takes the maximum plus one, also across the inserts of one batch', async () => {
    raw.exec(`create table counters (n integer not null, label text, primary key (n))`)
    raw.exec(`insert into counters values (10, 'a')`)
    const fresh = await driver.introspect('main')
    const res = await driver.applyMutations(
      planMutations(fresh, [
        { type: 'insert', table: 'counters', values: { n: { $fn: 'increment' }, label: 'b' } },
        { type: 'insert', table: 'counters', values: { n: { $fn: 'increment' }, label: 'c' } },
      ]),
    )
    expect(res.map((r) => r.row?.n)).toEqual([11, 12])
  })

  it('refuses it on a non-number column and as a key', async () => {
    const fresh = await driver.introspect('main')
    expect(() => planMutations(fresh, [{ type: 'insert', table: 'counters', values: { label: { $fn: 'increment' } } }])).toThrow(/number column/)
    expect(() => planMutations(fresh, [{ type: 'update', table: 'counters', pk: { n: { $fn: 'increment' } as never }, values: { label: 'x' } }])).toThrow()
  })
})
