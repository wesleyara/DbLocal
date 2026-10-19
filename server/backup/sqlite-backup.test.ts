import Database from 'better-sqlite3'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RestoreEvent } from '#shared/types/backup'
import { createConnection } from '../connections/repository'
import { getPoolManager } from '../drivers'
import { DriverError } from '../drivers/errors'
import { connectionDriver } from '../schema/service'
import { ConfirmationRequiredError } from '../query/errors'
import { migrateStore, openStore, type StoreSchema } from '../store/db'
import { setSecretKey } from '../utils/secrets'
import { streamDump } from './dump-service'
import { planRestore, runRestore } from './restore-service'

const SEED = fileURLToPath(new URL('../../fixtures/seed/sqlite.sql', import.meta.url))

let dir: string
let db: Kysely<StoreSchema>
let sourceId: string

const sqliteConnection = (name: string, filePath: string, extra: Record<string, unknown> = {}) => ({
  name,
  dialect: 'sqlite' as const,
  filePath,
  ssl: { mode: 'disable' as const },
  environment: 'local' as const,
  readonly: false,
  ...extra,
})

beforeAll(async () => {
  setSecretKey(Buffer.alloc(32, 5))
  dir = mkdtempSync(join(tmpdir(), 'dbl-backup-'))
  const source = new Database(join(dir, 'source.sqlite'))
  source.exec(readFileSync(SEED, 'utf8'))
  source.close()
  db = openStore(dir)
  await migrateStore(db)
  sourceId = (await createConnection(db, sqliteConnection('source', join(dir, 'source.sqlite')))).id
})

afterAll(async () => {
  await getPoolManager().closeAll()
  await db.destroy()
  rmSync(dir, { recursive: true, force: true })
})

async function dump(req: Parameters<typeof streamDump>[2]): Promise<string> {
  let out = ''
  await streamDump(db, sourceId, req, { write: async (c) => void (out += c), aborted: () => false })
  return out
}

async function restoreInto(name: string, sql: string, extra: Record<string, unknown> = {}) {
  const file = join(dir, `${name}.sqlite`)
  new Database(file).close()
  const id = (await createConnection(db, sqliteConnection(name, file, extra))).id
  const events: RestoreEvent[] = []
  const plan = await planRestore(db, id, sql, { confirm: false })
  await runRestore(db, id, plan, (e) => events.push(e), new AbortController().signal)
  return { file, events }
}

function snapshot(file: string) {
  const conn = new Database(file, { readonly: true })
  const objects = conn.prepare("select type, name from sqlite_schema where name not like 'sqlite_%' and type <> 'index' order by type, name").all()
  const counts = Object.fromEntries(
    (conn.prepare("select name from sqlite_schema where type = 'table' and name not like 'sqlite_%'").all() as { name: string }[]).map((t) => [
      t.name,
      (conn.prepare(`select count(*) as n from "${t.name}"`).get() as { n: number }).n,
    ]),
  )
  const sample = conn.prepare('select * from users order by id limit 3').all()
  conn.close()
  return { objects, counts, sample }
}

describe('SQLite dump and restore', () => {
  it('round-trips structure, rows, views and triggers', async () => {
    const sql = await dump({ structure: true, data: true })
    expect(sql).toContain('PRAGMA foreign_keys = OFF;')
    expect(sql).toContain('CREATE TRIGGER products_price_check')
    expect(sql).not.toContain('__dblocal_dump__')
    const { file, events } = await restoreInto('copy', sql)
    const done = events.at(-1)
    expect(done).toMatchObject({ type: 'done', failed: false })
    expect(snapshot(file)).toEqual(snapshot(join(dir, 'source.sqlite')))
    // Inline UNIQUE constraints come back as named unique indexes.
    const copy = new Database(file, { readonly: true })
    expect(copy.prepare("select name from sqlite_schema where type = 'index' and name = 'users_email_key'").get()).toBeTruthy()
    copy.close()
  })

  it('dumps only the structure, or only chosen tables', async () => {
    const structure = await dump({ structure: true, data: false })
    expect(structure).not.toContain('INSERT INTO')
    const one = await dump({ structure: true, data: true, tables: ['tags'] })
    expect(one).toContain('CREATE TABLE "tags"')
    expect(one).not.toContain('CREATE TABLE "users"')
  })

  it('stops at the first failing statement', async () => {
    const { events } = await restoreInto('broken', 'CREATE TABLE a (id integer);\nINSERT INTO nope VALUES (1);\nCREATE TABLE b (id integer);')
    expect(events.find((e) => e.type === 'error')).toMatchObject({ index: 1 })
    expect(events.at(-1)).toMatchObject({ type: 'done', executed: 1, failed: true })
  })

  it('refuses read-only connections and asks for confirmation on prod', async () => {
    const ro = (await createConnection(db, sqliteConnection('ro', join(dir, 'source.sqlite'), { readonly: true }))).id
    await expect(planRestore(db, ro, 'select 1;', { confirm: false })).rejects.toBeInstanceOf(DriverError)
    const prod = (await createConnection(db, sqliteConnection('prod', join(dir, 'source.sqlite'), { environment: 'prod' }))).id
    await expect(planRestore(db, prod, 'delete from tags;', { confirm: false })).rejects.toBeInstanceOf(ConfirmationRequiredError)
    await expect(planRestore(db, prod, 'delete from tags;', { confirm: true })).resolves.toBeTruthy()
  })

  it('copies the file with the backup API', async () => {
    const driver = await connectionDriver(db, sourceId)
    const target = join(dir, 'binary.sqlite')
    await driver.backupTo!(target)
    expect(snapshot(target)).toEqual(snapshot(join(dir, 'source.sqlite')))
  })
})
