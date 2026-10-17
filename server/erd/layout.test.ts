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
    expect(await getErdLayout(db, 'c1', 'public')).toEqual({ positions: {}, wires: {} })
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

  it('keeps moved lines, merges them, removes one with null and resets them with the layout', async () => {
    await saveErdLayout(db, 'c4', 's', { a: { x: 0, y: 0 } }, false, { 'r1#0': 40.4, 'r2#0': -12 })
    await saveErdLayout(db, 'c4', 's', {}, false, { 'r2#0': null, 'r3#0': 8 })
    const layout = await getErdLayout(db, 'c4', 's')
    expect(layout.wires).toEqual({ 'r1#0': 40, 'r3#0': 8 })
    expect(layout.positions).toEqual({ a: { x: 0, y: 0 } })
    await resetErdLayout(db, 'c4', 's')
    expect((await getErdLayout(db, 'c4', 's')).wires).toEqual({})
  })
})
