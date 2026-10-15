import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrateStore, openStore, type StoreSchema } from '../store/db'
import { getErdLayout, resetErdLayout, saveErdLayout } from './layout'

let dir: string
let db: Kysely<StoreSchema>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dbl-erd-'))
  db = openStore(dir)
  await migrateStore(db)
})
afterAll(async () => {
  await db.destroy()
  rmSync(dir, { recursive: true, force: true })
})

describe('erd layout store', () => {
  it('starts empty and keeps layouts apart per connection and schema', async () => {
    expect(await getErdLayout(db, 'c1', 'public')).toEqual({ positions: {} })
    await saveErdLayout(db, 'c1', 'public', { users: { x: 1, y: 2 } })
    expect((await getErdLayout(db, 'c1', 'public')).positions).toEqual({ users: { x: 1, y: 2 } })
    expect((await getErdLayout(db, 'c1', 'other')).positions).toEqual({})
    expect((await getErdLayout(db, 'c2', 'public')).positions).toEqual({})
  })

  it('merges saves, replaces on demand and resets', async () => {
    await saveErdLayout(db, 'c3', 's', { a: { x: 0, y: 0 } })
    await saveErdLayout(db, 'c3', 's', { b: { x: 5, y: 5 } })
    expect(Object.keys((await getErdLayout(db, 'c3', 's')).positions).sort()).toEqual(['a', 'b'])
    await saveErdLayout(db, 'c3', 's', { c: { x: 9, y: 9 } }, true)
    expect(Object.keys((await getErdLayout(db, 'c3', 's')).positions)).toEqual(['c'])
    await resetErdLayout(db, 'c3', 's')
    expect((await getErdLayout(db, 'c3', 's')).positions).toEqual({})
  })
})
