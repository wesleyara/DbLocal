import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { duplicateConnection, listConnections, updateConnection } from '../connections/repository'
import { listVirtualRelations } from '../schema/virtual-relations'
import { migrateStore, openStore, type StoreSchema } from '../store/db'
import { setSecretKey } from '../utils/secrets'
import { demoFilePath, openDemo, type DemoDeps } from './demo-service'

let db: Kysely<StoreSchema>
let dataDir: string
let released: string[]
let deps: DemoDeps
const seedSql = readFileSync(join(process.cwd(), 'fixtures/seed/demo.sql'), 'utf8')

beforeEach(async () => {
  setSecretKey(Buffer.alloc(32, 7))
  dataDir = mkdtempSync(join(tmpdir(), 'dbl-demo-'))
  db = openStore(mkdtempSync(join(tmpdir(), 'dbl-demo-store-')))
  await migrateStore(db)
  released = []
  deps = { db, dataDir, seedSql: async () => seedSql, release: async (id) => void released.push(id) }
})

afterEach(async () => {
  await db.destroy()
})

const count = (file: string, table: string) => {
  const d = new Database(file, { readonly: true })
  try {
    return (d.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n
  } finally {
    d.close()
  }
}

describe('demo database', () => {
  it('copies the file into the data dir and creates a flagged connection with its virtual relation', async () => {
    const view = await openDemo(deps)
    expect(view.demo).toBe(true)
    expect(view.dialect).toBe('sqlite')
    expect(view.filePath).toBe(demoFilePath(dataDir))
    expect(existsSync(demoFilePath(dataDir))).toBe(true)
    expect(count(demoFilePath(dataDir), 'users')).toBe(200)
    const virtual = await listVirtualRelations(db, view.id, 'main')
    expect(virtual).toHaveLength(1)
    expect(virtual[0]).toMatchObject({ fromTable: 'audit_logs', toTable: 'users' })
  })

  it('reuses the connection and the file when opened again', async () => {
    const first = await openDemo(deps)
    const again = await openDemo(deps)
    expect(again.id).toBe(first.id)
    expect(await listConnections(db)).toHaveLength(1)
    expect(await listVirtualRelations(db, first.id, 'main')).toHaveLength(1)
    expect(released).toEqual([])
  })

  it('reset restores the original data and releases the pool first', async () => {
    const view = await openDemo(deps)
    const file = demoFilePath(dataDir)
    const edit = new Database(file)
    const logs = count(file, 'audit_logs')
    edit.exec("delete from audit_logs; update products set name = 'changed'")
    edit.close()
    expect(count(file, 'audit_logs')).toBe(0)

    const after = await openDemo(deps, { reset: true })
    expect(after.id).toBe(view.id)
    expect(released).toEqual([view.id])
    expect(count(file, 'audit_logs')).toBe(logs)
    expect(await listVirtualRelations(db, view.id, 'main')).toHaveLength(1)
  })

  it('recreates a deleted file on the next open', async () => {
    const view = await openDemo(deps)
    const { rmSync } = await import('node:fs')
    rmSync(demoFilePath(dataDir))
    await openDemo(deps)
    expect(count(demoFilePath(dataDir), 'users')).toBe(200)
    expect(released).toEqual([view.id])
  })

  it('keeps the flag through an edit and drops it on a duplicate', async () => {
    const view = await openDemo(deps)
    const renamed = await updateConnection(db, view.id, { name: 'My demo' })
    expect(renamed.demo).toBe(true)
    const copy = await duplicateConnection(db, view.id)
    expect(copy.demo).toBe(false)
  })
})
