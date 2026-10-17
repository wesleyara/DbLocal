import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrateStore, openStore, type StoreSchema } from '../store/db'
import { resetErdLayout } from './layout'
import { getErdNotes, saveErdNotes } from './notes'

let dir: string
let db: Kysely<StoreSchema>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dbl-erd-notes-'))
  db = openStore(dir)
  await migrateStore(db)
})
afterAll(async () => {
  await db.destroy()
  rmSync(dir, { recursive: true, force: true })
})

describe('erd notes store', () => {
  const note = { id: 'n1', x: 10, y: 20, text: 'Ask about soft deletes', width: 420 }

  it('keeps notes per connection and schema, replacing the list on save', async () => {
    expect(await getErdNotes(db, 'c1', 'public')).toEqual([])
    await saveErdNotes(db, 'c1', 'public', [note])
    expect(await getErdNotes(db, 'c1', 'public')).toEqual([note])
    expect(await getErdNotes(db, 'c1', 'other')).toEqual([])
    await saveErdNotes(db, 'c1', 'public', [{ ...note, id: 'n2' }])
    expect((await getErdNotes(db, 'c1', 'public')).map((n) => n.id)).toEqual(['n2'])
    await saveErdNotes(db, 'c1', 'public', [])
    expect(await getErdNotes(db, 'c1', 'public')).toEqual([])
  })

  it('survives a layout reset and skips corrupt entries', async () => {
    await saveErdNotes(db, 'c2', 's', [note])
    await resetErdLayout(db, 'c2', 's')
    expect(await getErdNotes(db, 'c2', 's')).toEqual([note])
    await db
      .updateTable('preferences')
      .set({ value: JSON.stringify([note, { id: '', x: 'a' }]) })
      .where('key', '=', 'erd-notes|c2|s')
      .execute()
    expect(await getErdNotes(db, 'c2', 's')).toEqual([note])
  })
})
