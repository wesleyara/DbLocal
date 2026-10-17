import type { Kysely } from 'kysely'
import type { ErdNote } from '#shared/erd'
import { erdNoteSchema } from '#shared/schemas/erd'
import type { StoreSchema } from '../store/db'

type Db = Kysely<StoreSchema>

/** Kept apart from the layout, so "Reset layout" never drops the notes. */
const notesKey = (connectionId: string, schema: string) => `erd-notes|${connectionId}|${schema}`

/** Notes of one connection + schema. Missing or corrupt data reads as none; invalid entries are skipped. */
export async function getErdNotes(db: Db, connectionId: string, schema: string): Promise<ErdNote[]> {
  const row = await db
    .selectFrom('preferences')
    .select('value')
    .where('key', '=', notesKey(connectionId, schema))
    .executeTakeFirst()
  if (!row) return []
  try {
    const parsed = JSON.parse(row.value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((n) => {
      const ok = erdNoteSchema.safeParse(n)
      return ok.success ? [ok.data] : []
    })
  } catch {
    return []
  }
}

/** Replaces the notes of the schema; an empty list removes the entry. */
export async function saveErdNotes(db: Db, connectionId: string, schema: string, notes: ErdNote[]): Promise<ErdNote[]> {
  const key = notesKey(connectionId, schema)
  if (!notes.length) {
    await db.deleteFrom('preferences').where('key', '=', key).execute()
    return []
  }
  const value = JSON.stringify(notes)
  await db
    .insertInto('preferences')
    .values({ key, value })
    .onConflict((oc) => oc.column('key').doUpdateSet({ value }))
    .execute()
  return notes
}
