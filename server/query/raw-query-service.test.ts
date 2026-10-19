import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createConnection, updateConnection } from '../connections/repository'
import { getPoolManager } from '../drivers'
import { migrateStore, openStore, type StoreSchema } from '../store/db'
import { setSecretKey } from '../utils/secrets'
import { ConfirmationRequiredError } from './errors'
import { cancelQuery, runRawQuery, shapeOutput, uniqueColumnNames } from './raw-query-service'

let dir: string
let db: Kysely<StoreSchema>
let file: string
let connId: string

const input = (extra: Record<string, unknown> = {}) => ({
  name: 'raw',
  dialect: 'sqlite' as const,
  filePath: file,
  ssl: { mode: 'disable' as const },
  environment: 'local' as const,
  readonly: false,
  ...extra,
})

beforeAll(async () => {
  setSecretKey(Buffer.alloc(32, 9))
  dir = mkdtempSync(join(tmpdir(), 'dbl-raw-'))
  file = join(dir, 'raw.sqlite')
  const seed = new Database(file)
  seed.exec(`
    create table people (id integer primary key, name text not null, age integer);
    insert into people values (1, 'Ana', 30), (2, 'Bruno', 40), (3, 'Carla', null);
    create table pets (id integer primary key, owner_id integer, name text);
    insert into pets values (1, 1, 'Rex');
  `)
  seed.close()
  db = openStore(dir)
  await migrateStore(db)
  connId = (await createConnection(db, input())).id
})

afterAll(async () => {
  await getPoolManager().closeAll()
  await db.destroy()
  rmSync(dir, { recursive: true, force: true })
})

const run = (sql: string, extra: Record<string, unknown> = {}) => runRawQuery(db, connId, { sql, ...extra })

describe('unique column names', () => {
  it('suffixes repeated names', () => {
    expect(uniqueColumnNames(['id', 'name', 'id', 'id'])).toEqual(['id', 'name', 'id_2', 'id_3'])
  })

  it('keeps both columns of a join as separate keys', () => {
    const out = shapeOutput({
      columns: [{ name: 'id', type: 'INTEGER' }, { name: 'id', type: 'INTEGER' }],
      rows: [[1, 7]],
      truncated: false,
      affectedRows: null,
      notices: [],
    })
    expect(out.rows[0]).toEqual({ id: 1, id_2: 7 })
  })
})

describe('raw SQL on SQLite', () => {
  it('returns columns with types, rows and timings', async () => {
    const res = await run('select id, name, age from people order by id')
    const [st] = res.statements
    expect(st).toMatchObject({ status: 'ok', kind: 'read', rowCount: 3, truncated: false, affectedRows: null })
    expect(st!.columns.map((c) => [c.name, c.type])).toEqual([['id', 'INTEGER'], ['name', 'TEXT'], ['age', 'INTEGER']])
    expect(st!.rows[2]).toEqual({ id: 3, name: 'Carla', age: null })
    expect(res.queryId).toBeTruthy()
  })

  it('returns one result per statement', async () => {
    const res = await run("select 1 as a; select name from people where id = 2; select ';' as semi")
    expect(res.statements.map((s) => s.rowCount)).toEqual([1, 1, 1])
    expect(res.statements[1]!.rows).toEqual([{ name: 'Bruno' }])
    expect(res.statements[2]!.rows).toEqual([{ semi: ';' }])
  })

  it('truncates at the limit', async () => {
    const res = await run('select * from people order by id', { limit: 2 })
    expect(res.statements[0]).toMatchObject({ rowCount: 2, truncated: true })
  })

  it('reports affected rows and classifies writes', async () => {
    const res = await run("insert into pets (owner_id, name) values (2, 'Tom'); update pets set name = 'Tommy' where owner_id = 2")
    expect(res.statements.map((s) => [s.kind, s.affectedRows])).toEqual([['write', 1], ['write', 1]])
  })

  it('stops at the first error and skips the rest', async () => {
    const res = await run('select 1; select * from nope; select 3')
    expect(res.statements.map((s) => s.status)).toEqual(['ok', 'error', 'skipped'])
    expect(res.statements[1]!.error!.message).toMatch(/no such table/)
  })

  it('drops the schema cache after DDL', async () => {
    const res = await run('create table extras (id integer primary key); drop table extras', { confirmWrites: true })
    expect(res.statements.map((s) => s.kind)).toEqual(['ddl', 'ddl'])
    expect(res.schemaInvalidated).toBe(true)
    expect((await run('select 1')).schemaInvalidated).toBe(false)
  })

  it('records every statement that ran in the history', async () => {
    const before = await db.selectFrom('query_history').select(db.fn.countAll<number>().as('n')).executeTakeFirstOrThrow()
    await run('select 1; select * from nope; select 3')
    const rows = await db.selectFrom('query_history').selectAll().orderBy('id', 'desc').limit(2).execute()
    const after = await db.selectFrom('query_history').select(db.fn.countAll<number>().as('n')).executeTakeFirstOrThrow()
    expect(Number(after.n) - Number(before.n)).toBe(2)
    expect(rows[0]).toMatchObject({ connection_id: connId, status: 'error', sql: 'select * from nope' })
    expect(rows[0]!.error).toMatch(/no such table/)
    expect(rows[1]).toMatchObject({ status: 'ok', row_count: 1 })
  })

  it('refuses an empty script', async () => {
    await expect(run('  -- nothing\n ;')).rejects.toMatchObject({ status: 400 })
  })

  // Rows keep coming (one every few ms), so the session gets turns of the event loop to stop.
  const slow = `with recursive c(x) as (select 1 union all select x + 1 from c where x < 2000000000) select x from c where x % 200000 = 0`

  it('times out a long statement', async () => {
    const started = performance.now()
    const res = await run(slow, { timeoutMs: 300, limit: 100000 })
    expect(res.statements[0]).toMatchObject({ status: 'timeout', error: { code: 'timeout' } })
    expect(performance.now() - started).toBeLessThan(5000)
  }, 30_000)

  it('cancels a running query by id', async () => {
    const pending = run(slow, { queryId: 'cancel-me-0001', limit: 100000 })
    await new Promise((r) => setTimeout(r, 150))
    expect(await cancelQuery(connId, 'cancel-me-0001')).toBe(true)
    const res = await pending
    expect(res.statements[0]).toMatchObject({ status: 'cancelled', error: { code: 'cancelled' } })
    expect(await cancelQuery(connId, 'cancel-me-0001')).toBe(false)
  }, 30_000)

  it('cancel returns false for an unknown query', async () => {
    expect(await cancelQuery(connId, 'does-not-exist')).toBe(false)
  })
})

describe('guards', () => {
  it('refuses anything but reads on a read-only connection, before running', async () => {
    const ro = (await createConnection(db, input({ name: 'ro', readonly: true }))).id
    for (const sql of ["insert into people values (9, 'X', 1)", 'create table t (a int)', 'update people set age = 1', 'select 1; delete from people', 'pragma journal_mode = wal']) {
      await expect(runRawQuery(db, ro, { sql })).rejects.toMatchObject({ code: 'permission' })
    }
    const res = await runRawQuery(db, ro, { sql: 'select count(*) as n from people' })
    expect(res.statements[0]!.rows).toEqual([{ n: 3 }])
    const raw = new Database(file, { readonly: true })
    expect(raw.prepare('select count(*) as n from people').get()).toEqual({ n: 3 })
    raw.close()
  })

  it('also refuses when the global flag is set', async () => {
    process.env.DBLOCAL_READONLY = '1'
    try {
      await expect(run('delete from people')).rejects.toMatchObject({ code: 'permission' })
    } finally {
      delete process.env.DBLOCAL_READONLY
    }
  })

  it('asks for confirmation on prod, only for writes and DDL', async () => {
    const prod = (await createConnection(db, input({ name: 'prod', environment: 'prod' }))).id
    await expect(runRawQuery(db, prod, { sql: "insert into pets (name) values ('Z')" })).rejects.toBeInstanceOf(ConfirmationRequiredError)
    expect((await runRawQuery(db, prod, { sql: 'select 1' })).statements[0]!.status).toBe('ok')
    const res = await runRawQuery(db, prod, { sql: "insert into pets (name) values ('Z')", confirmWrites: true })
    expect(res.statements[0]!.affectedRows).toBe(1)
    await updateConnection(db, prod, { readonly: true })
    await expect(runRawQuery(db, prod, { sql: 'delete from pets', confirmWrites: true })).rejects.toMatchObject({ code: 'permission' })
  })

  it('asks for confirmation before destructive statements on any connection', async () => {
    const attempt = run('create table scratch (id integer); drop table scratch')
    await expect(attempt).rejects.toBeInstanceOf(ConfirmationRequiredError)
    await expect(attempt).rejects.toMatchObject({ risks: [{ kind: 'drop', target: 'scratch' }] })
    // Nothing ran: the table was not even created.
    expect((await run("select count(*) as n from sqlite_schema where name = 'scratch'")).statements[0]!.rows[0]).toEqual({ n: 0 })
    expect((await run('delete from pets where id = 999')).statements[0]!.status).toBe('ok')
    expect((await run('create table scratch (id integer); drop table scratch', { confirmWrites: true })).statements[1]!.status).toBe('ok')
  })
})
