import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { alterTableSql, createTableSql, draftFromTable, newTableDraft, scriptOf } from '#shared/ddl'
import type { SchemaTable } from '#shared/types/db'
import { createConnection } from '../connections/repository'
import { getPoolManager } from '../drivers'
import { runRawQuery } from '../query/raw-query-service'
import { migrateStore, openStore, type StoreSchema } from '../store/db'
import { setSecretKey } from '../utils/secrets'
import { readSchema } from './service'

/** The structure editor's scripts, run through the raw SQL endpoint on a real SQLite file. */
let dir: string
let db: Kysely<StoreSchema>
let file: string
let connId: string

beforeAll(async () => {
  setSecretKey(Buffer.alloc(32, 7))
  dir = mkdtempSync(join(tmpdir(), 'dbl-ddl-'))
  file = join(dir, 'ddl.sqlite')
  const seed = new Database(file)
  seed.exec(`
    create table users (id integer primary key, email text not null unique, role text default 'user');
    insert into users values (1, 'ana@x.test', 'admin'), (2, 'bruno@x.test', null);
    create table orders (id integer primary key, user_id integer references users(id), note text);
    insert into orders values (10, 1, 'first');
    create index orders_note_idx on orders (note);
    create trigger orders_note_check before insert on orders when new.note = 'bad' begin select raise(abort, 'bad note'); end;
  `)
  seed.close()
  db = openStore(dir)
  await migrateStore(db)
  connId = (
    await createConnection(db, {
      name: 'ddl',
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

async function table(name: string): Promise<SchemaTable> {
  const { snapshot } = await readSchema(db, connId, 'main')
  return snapshot.tables.find((t) => t.name === name)!
}

async function run(sql: string): Promise<void> {
  const res = await runRawQuery(db, connId, { sql, schema: 'main', confirmWrites: true })
  const failed = res.statements.find((s) => s.status !== 'ok')
  expect(failed?.error?.message ?? null).toBeNull()
}

const rows = (sql: string) => {
  const raw = new Database(file, { readonly: true })
  try {
    return raw.prepare(sql).all()
  } finally {
    raw.close()
  }
}

describe('structure changes on SQLite', () => {
  it('creates a table with a rowid key, a foreign key and an index', async () => {
    const draft = newTableDraft('sqlite')
    draft.name = 'tags'
    draft.columns.push({ from: null, name: 'user_id', type: 'INTEGER', nullable: true, default: null, identity: false, computed: false, comment: null, onUpdate: null })
    draft.foreignKeys.push({ from: null, name: '', columns: ['user_id'], refTable: 'users', refColumns: ['id'], onDelete: 'cascade', onUpdate: 'no action' })
    draft.indexes.push({ from: null, name: 'tags_user_id_idx', columns: ['user_id'], unique: false })
    await run(scriptOf('sqlite', { statements: createTableSql('sqlite', 'main', draft), rebuild: false }))
    const tags = await table('tags')
    expect(tags.primaryKey).toEqual(['id'])
    expect(tags.foreignKeys[0]).toMatchObject({ columns: ['user_id'], refTable: 'users', onDelete: 'cascade' })
    expect(tags.indexes.map((i) => i.name)).toEqual(['tags_user_id_idx'])
  })

  it('renames and adds columns with ALTER TABLE, keeping the data', async () => {
    const draft = draftFromTable(await table('users'))
    draft.columns[2]!.name = 'kind'
    draft.columns.push({ from: null, name: 'age', type: 'INTEGER', nullable: true, default: '0', identity: false, computed: false, comment: null, onUpdate: null })
    const ddl = alterTableSql('sqlite', 'main', await table('users'), draft)
    expect(ddl.rebuild).toBe(false)
    await run(scriptOf('sqlite', ddl))
    expect(rows('select id, kind, age from users order by id')).toEqual([
      { id: 1, kind: 'admin', age: 0 },
      { id: 2, kind: null, age: 0 },
    ])
  })

  it('rebuilds the table for a NOT NULL change, keeping rows, indexes, foreign keys and triggers', async () => {
    const orders = await table('orders')
    const draft = draftFromTable(orders)
    draft.columns[2]!.nullable = false
    draft.columns[2]!.default = "''"
    draft.columns[2]!.name = 'memo'
    const trigger = (rows("select sql from sqlite_schema where type = 'trigger' and name = 'orders_note_check'")[0] as { sql: string }).sql
    const ddl = alterTableSql('sqlite', 'main', orders, draft, [trigger.replace('new.note', 'new.memo')])
    expect(ddl.rebuild).toBe(true)
    await run(scriptOf('sqlite', ddl))
    const after = await table('orders')
    expect(after.columns.find((c) => c.name === 'memo')).toMatchObject({ nullable: false, default: "''" })
    expect(after.primaryKey).toEqual(['id'])
    expect(after.foreignKeys[0]).toMatchObject({ columns: ['user_id'], refTable: 'users' })
    expect(after.indexes.map((i) => i.columns)).toEqual([['memo']])
    expect(rows('select * from orders')).toEqual([{ id: 10, user_id: 1, memo: 'first' }])
    expect(rows("select name from sqlite_schema where type = 'trigger'")).toEqual([{ name: 'orders_note_check' }])
    expect(rows('pragma foreign_key_check')).toEqual([])
  })

  it('rebuilds to drop a unique constraint, turning nothing else into an autoindex', async () => {
    const users = await table('users')
    const draft = draftFromTable(users)
    draft.indexes = []
    await run(scriptOf('sqlite', alterTableSql('sqlite', 'main', users, draft)))
    expect((await table('users')).indexes).toEqual([])
    expect(rows('select count(*) as n from users')).toEqual([{ n: 2 }])
  })
})
