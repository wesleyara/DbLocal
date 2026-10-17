import type { Kysely } from 'kysely'
import type { Note } from '#shared/schemas/notes'
import type { StoreSchema } from '../store/db'

type Db = Kysely<StoreSchema>

/** One note per connection, whatever the schema. */
export const connectionNoteKey = (connectionId: string) => `notes|${connectionId}`
/** One note per connection + schema + table. */
export const tableNoteKey = (connectionId: string, schema: string, table: string) =>
  `table-notes|${connectionId}|${schema}|${table}`

const EMPTY: Note = { content: '', updatedAt: null }

/** The note stored under `key`. Missing or corrupt data reads as an empty note. */
export async function getNote(db: Db, key: string): Promise<Note> {
  const row = await db.selectFrom('preferences').select('value').where('key', '=', key).executeTakeFirst()
  if (!row) return { ...EMPTY }
  try {
    const parsed = JSON.parse(row.value) as Partial<Note>
    if (typeof parsed.content !== 'string') return { ...EMPTY }
    return { content: parsed.content, updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null }
  } catch {
    return { ...EMPTY }
  }
}

/** Replaces the note; blank content removes the entry. */
export async function saveNote(db: Db, key: string, content: string, now = new Date()): Promise<Note> {
  if (!content.trim()) {
    await db.deleteFrom('preferences').where('key', '=', key).execute()
    return { ...EMPTY }
  }
  const note: Note = { content, updatedAt: now.toISOString() }
  const value = JSON.stringify(note)
  await db
    .insertInto('preferences')
    .values({ key, value })
    .onConflict((oc) => oc.column('key').doUpdateSet({ value }))
    .execute()
  return note
}
