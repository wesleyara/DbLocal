import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { alterTableSql, createTableSql, draftFromTable, dropTableSql, newTableDraft, scriptOf, type DdlDialect } from '#shared/ddl'
import { splitStatements } from '#shared/sql-split'
import type { SchemaTable } from '#shared/types/db'
import { createDriver, type Driver, type DriverConfig } from '../drivers'

/**
 * The structure editor's scripts on the dev databases (`pnpm db:up`), on throw-away tables.
 * Opt-in: DBLOCAL_DEV_DB=1.
 */
const enabled = process.env.DBLOCAL_DEV_DB === '1'
const PARENT = 'dblocal_ddl_parent'
const CHILD = 'dblocal_ddl_child'

const targets: { name: DdlDialect; config: DriverConfig; schema: string }[] = [
  {
    name: 'postgres',
    config: { id: 'ddl-pg', dialect: 'postgres', host: '127.0.0.1', port: 54329, user: 'dblocal', password: 'dblocal', database: 'dblocal_dev' },
    schema: 'public',
  },
  {
    name: 'mysql',
    config: { id: 'ddl-mysql', dialect: 'mysql', host: '127.0.0.1', port: 33069, user: 'dblocal', password: 'dblocal', database: 'dblocal_dev' },
    schema: 'dblocal_dev',
  },
]

describe.skipIf(!enabled)('structure changes on dev databases', () => {
  for (const target of targets) {
    describe(target.name, () => {
      let driver: Driver
      const dialect = target.name

      async function run(sql: string): Promise<void> {
        const session = await driver.openQuerySession({ schema: target.schema, readonly: false })
        try {
          for (const s of splitStatements(sql, dialect)) await session.run(s.sql, 10)
        } finally {
          await session.close({ discard: true })
        }
      }
      const table = async (name: string): Promise<SchemaTable> => (await driver.introspect(target.schema)).tables.find((t) => t.name === name)!
      const drop = async () => {
        for (const name of [CHILD, PARENT]) {
          if (await table(name)) await run(dropTableSql(dialect, target.schema, name))
        }
      }

      beforeAll(async () => {
        driver = await createDriver(target.config)
        await drop()
      })
      afterAll(async () => {
        await drop()
        await driver.close()
      })

      it('creates two related tables', async () => {
        const parent = newTableDraft(dialect)
        parent.name = PARENT
        parent.columns.push({ from: null, name: 'label', type: 'varchar(50)', nullable: false, default: "'none'", identity: false, computed: false, comment: null, onUpdate: null })
        parent.indexes.push({ from: null, name: `${PARENT}_label_key`, columns: ['label'], unique: true })
        await run(scriptOf(dialect, { statements: createTableSql(dialect, target.schema, parent), rebuild: false }))

        const child = newTableDraft(dialect)
        child.name = CHILD
        child.columns.push({ from: null, name: 'parent_id', type: 'bigint', nullable: true, default: null, identity: false, computed: false, comment: null, onUpdate: null })
        child.foreignKeys.push({ from: null, name: `${CHILD}_parent_id_fkey`, columns: ['parent_id'], refTable: PARENT, refColumns: ['id'], onDelete: 'set null', onUpdate: 'no action' })
        await run(scriptOf(dialect, { statements: createTableSql(dialect, target.schema, child), rebuild: false }))

        const p = await table(PARENT)
        expect(p.columns.find((c) => c.name === 'id')).toMatchObject({ identity: true })
        expect(p.columns.find((c) => c.name === 'label')!.default).toMatch(/none/)
        expect((await table(CHILD)).foreignKeys[0]).toMatchObject({ refTable: PARENT, onDelete: 'set null' })
        await run(`insert into ${dialect === 'mysql' ? `\`${PARENT}\`` : `"${PARENT}"`} (label) values ('a')`)
      })

      it('renames, retypes and changes NULL and defaults, keeping the default it does not touch', async () => {
        const before = await table(PARENT)
        const draft = draftFromTable(before)
        const label = draft.columns.find((c) => c.name === 'label')!
        label.name = 'title'
        label.type = 'varchar(120)'
        label.nullable = true
        draft.columns.push({ from: null, name: 'rank', type: 'integer', nullable: false, default: '1', identity: false, computed: false, comment: null, onUpdate: null })
        await run(scriptOf(dialect, alterTableSql(dialect, target.schema, before, draft)))
        const after = await table(PARENT)
        const title = after.columns.find((c) => c.name === 'title')!
        expect(title).toMatchObject({ nullable: true })
        expect(title.nativeType).toMatch(/120/)
        expect(title.default).toMatch(/none/)
        expect(after.columns.find((c) => c.name === 'rank')).toMatchObject({ nullable: false })
        expect(after.columns.find((c) => c.name === 'id')).toMatchObject({ identity: true })
      })

      it('drops the foreign key and the unique index, then the column', async () => {
        const child = await table(CHILD)
        const childDraft = draftFromTable(child)
        childDraft.foreignKeys = []
        await run(scriptOf(dialect, alterTableSql(dialect, target.schema, child, childDraft)))
        expect((await table(CHILD)).foreignKeys).toEqual([])

        const parent = await table(PARENT)
        const draft = draftFromTable(parent)
        draft.indexes = []
        draft.columns = draft.columns.filter((c) => c.name !== 'rank')
        await run(scriptOf(dialect, alterTableSql(dialect, target.schema, parent, draft)))
        const after = await table(PARENT)
        expect(after.indexes.filter((i) => !i.primary)).toEqual([])
        expect(after.columns.map((c) => c.name)).toEqual(['id', 'title'])
      })
    })
  }
})
