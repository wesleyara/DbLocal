import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrateStore, openStore, type StoreSchema } from '../store/db'
import { connectionNoteKey, getNote, saveNote, tableNoteKey } from './notes'

let dir: string
let db: Kysely<StoreSchema>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dbl-notes-'))
  db = openStore(dir)
  await migrateStore(db)
})
afterAll(async () => {
  await db.destroy()
  rmSync(dir, { recursive: true, force: true })
})

describe('notes store', () => {
  const now = new Date('2026-10-17T12:00:00Z')

  it('reads an empty note when nothing was saved', async () => {
    expect(await getNote(db, connectionNoteKey('c1'))).toEqual({ content: '', updatedAt: null })
  })

  it('keeps connection and table notes apart', async () => {
    await saveNote(db, connectionNoteKey('c1'), '# Prod replica', now)
    await saveNote(db, tableNoteKey('c1', 'public', 'users'), 'Soft deleted via `deleted_at`', now)
    expect(await getNote(db, connectionNoteKey('c1'))).toEqual({ content: '# Prod replica', updatedAt: now.toISOString() })
    expect((await getNote(db, tableNoteKey('c1', 'public', 'users'))).content).toBe('Soft deleted via `deleted_at`')
    expect((await getNote(db, tableNoteKey('c1', 'other', 'users'))).content).toBe('')
    expect((await getNote(db, connectionNoteKey('c2'))).content).toBe('')
  })

  it('replaces the content on save and removes the entry when blank', async () => {
    const key = tableNoteKey('c1', 'public', 'orders')
    await saveNote(db, key, 'first', now)
    await saveNote(db, key, 'second', now)
    expect((await getNote(db, key)).content).toBe('second')
    expect(await saveNote(db, key, '  \n')).toEqual({ content: '', updatedAt: null })
    const row = await db.selectFrom('preferences').select('key').where('key', '=', key).executeTakeFirst()
    expect(row).toBeUndefined()
  })

  it('reads corrupt data as an empty note', async () => {
    const key = connectionNoteKey('broken')
    await db.insertInto('preferences').values({ key, value: '{not json' }).execute()
    expect(await getNote(db, key)).toEqual({ content: '', updatedAt: null })
  })
})
