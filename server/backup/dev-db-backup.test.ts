import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RestoreEvent } from '#shared/types/backup'
import { createConnection } from '../connections/repository'
import { getPoolManager } from '../drivers'
import { connectionDriver } from '../schema/service'
import { migrateStore, openStore, type StoreSchema } from '../store/db'
import { setSecretKey } from '../utils/secrets'
import { streamDump } from './dump-service'
import { planRestore, runRestore } from './restore-service'

/**
 * Dump of the dev dataset (`pnpm db:up && pnpm db:seed`) restored into another schema / database,
 * then compared table by table. Opt-in: DBLOCAL_DEV_DB=1.
 */
const enabled = process.env.DBLOCAL_DEV_DB === '1'

const targets = [
  {
    dialect: 'postgres' as const,
    source: {
      host: '127.0.0.1',
      port: 54329,
      user: 'dblocal',
      database: 'dblocal_dev',
      defaultSchema: 'public',
    },
    target: {
      host: '127.0.0.1',
      port: 54329,
      user: 'dblocal',
      database: 'dblocal_dev',
      defaultSchema: 'dblocal_restore',
    },
    setup: ['DROP SCHEMA IF EXISTS dblocal_restore CASCADE', 'CREATE SCHEMA dblocal_restore'],
    teardown: ['DROP SCHEMA IF EXISTS dblocal_restore CASCADE'],
    /** Routines and a trigger in the source, so the dump carries them (dropped afterwards). */
    logic: [
      'CREATE FUNCTION dblocal_dump_fn() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$',
      'CREATE FUNCTION dblocal_dump_trg() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$',
      'CREATE TRIGGER dblocal_dump_trg BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION dblocal_dump_trg()',
    ],
    dropLogic: [
      'DROP TRIGGER IF EXISTS dblocal_dump_trg ON tags',
      'DROP FUNCTION IF EXISTS dblocal_dump_trg()',
      'DROP FUNCTION IF EXISTS dblocal_dump_fn()',
    ],
    routines: ['dblocal_dump_fn', 'dblocal_dump_trg'],
  },
  {
    dialect: 'mysql' as const,
    source: {
      host: '127.0.0.1',
      port: 33069,
      user: 'root',
      database: 'dblocal_dev',
      defaultSchema: null,
    },
    target: {
      host: '127.0.0.1',
      port: 33069,
      user: 'root',
      database: 'dblocal_restore',
      defaultSchema: null,
    },
    setup: ['DROP DATABASE IF EXISTS dblocal_restore', 'CREATE DATABASE dblocal_restore'],
    teardown: ['DROP DATABASE IF EXISTS dblocal_restore'],
    logic: [
      'CREATE FUNCTION dblocal_dump_fn() RETURNS INT DETERMINISTIC RETURN 1',
      'CREATE TRIGGER dblocal_dump_trg BEFORE UPDATE ON tags FOR EACH ROW SET NEW.name = NEW.name',
    ],
    dropLogic: [
      'DROP TRIGGER IF EXISTS dblocal_dump_trg',
      'DROP FUNCTION IF EXISTS dblocal_dump_fn',
    ],
    routines: ['dblocal_dump_fn'],
  },
]

describe.skipIf(!enabled)('dump and restore on dev databases', () => {
  let dir: string
  let db: Kysely<StoreSchema>

  beforeAll(async () => {
    setSecretKey(Buffer.alloc(32, 3))
    dir = mkdtempSync(join(tmpdir(), 'dbl-devdump-'))
    db = openStore(dir)
    await migrateStore(db)
  })
  afterAll(async () => {
    await getPoolManager().closeAll()
    await db.destroy()
    rmSync(dir, { recursive: true, force: true })
  })

  for (const t of targets) {
    it(`${t.dialect}: round-trips the dev dataset into another ${t.dialect === 'mysql' ? 'database' : 'schema'}`, async () => {
      const base = {
        dialect: t.dialect,
        ssl: { mode: 'disable' as const },
        environment: 'local' as const,
        readonly: false,
        password: 'dblocal',
      }
      const source = (
        await createConnection(db, { ...base, name: `${t.dialect}-src`, ...t.source })
      ).id
      const target = (
        await createConnection(db, {
          ...base,
          name: `${t.dialect}-dst`,
          ...t.target,
          database: t.source.database,
        })
      ).id
      const admin = await (await connectionDriver(db, target)).openQuerySession({ readonly: false })
      for (const sql of t.setup) await admin.run(sql, 1)
      await admin.close({ discard: true })
      const srcSession = await (
        await connectionDriver(db, source)
      ).openQuerySession({
        schema: t.dialect === 'mysql' ? 'dblocal_dev' : 'public',
        readonly: false,
      })
      for (const sql of [...t.dropLogic, ...t.logic]) await srcSession.run(sql, 1)
      await srcSession.close({ discard: true })
      try {
        let sql = ''
        await streamDump(
          db,
          source,
          { structure: true, data: true },
          { write: async (c) => void (sql += c), aborted: () => false },
        )
        const schema = 'dblocal_restore'
        const events: RestoreEvent[] = []
        const plan = await planRestore(db, target, sql, { schema, confirm: true })
        await runRestore(db, target, plan, (e) => events.push(e), new AbortController().signal)
        expect(events.filter((e) => e.type === 'error')).toEqual([])

        const srcDriver = await connectionDriver(db, source)
        const srcSchema = t.dialect === 'mysql' ? 'dblocal_dev' : 'public'
        const before = await srcDriver.introspect(srcSchema)
        const after = await srcDriver.introspect(schema)
        const shape = (s: typeof before) =>
          s.tables
            .map((x) => ({
              name: x.name,
              kind: x.kind,
              columns: x.columns.map((c) => [c.name, c.kind, c.nullable]),
              fks: x.foreignKeys.length,
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
        expect(shape(after)).toEqual(shape(before))

        const session = await srcDriver.openQuerySession({ readonly: true })
        const q = (s: string) => (t.dialect === 'mysql' ? `\`${s}\`` : `"${s}"`)
        try {
          for (const table of before.tables.filter((x) => x.kind === 'table')) {
            const a = await session.run(`SELECT count(*) FROM ${q(srcSchema)}.${q(table.name)}`, 1)
            const b = await session.run(`SELECT count(*) FROM ${q(schema)}.${q(table.name)}`, 1)
            expect([table.name, String(b.rows[0]![0])]).toEqual([table.name, String(a.rows[0]![0])])
          }
        } finally {
          await session.close({ discard: true })
        }
        const routines = await srcDriver.listRoutines(schema)
        expect(routines.routines.map((r) => r.name).sort()).toEqual(t.routines)
        expect(routines.triggers.map((r) => r.name)).toEqual(['dblocal_dump_trg'])
      } finally {
        const cleanup = await (
          await connectionDriver(db, target)
        ).openQuerySession({ readonly: false })
        for (const s of t.teardown) await cleanup.run(s, 1)
        await cleanup.close({ discard: true })
        const src = await (
          await connectionDriver(db, source)
        ).openQuerySession({
          schema: t.dialect === 'mysql' ? 'dblocal_dev' : 'public',
          readonly: false,
        })
        for (const s of t.dropLogic) await src.run(s, 1)
        await src.close({ discard: true })
      }
    }, 120_000)
  }
})
