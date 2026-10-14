import type { Kysely } from 'kysely'
import type { GridPrefs } from '#shared/types/rows'
import type { StoreSchema } from '../store/db'

type Db = Kysely<StoreSchema>

const prefsKey = (connectionId: string, schema: string, table: string) =>
  `grid-prefs|${connectionId}|${schema}|${table}`

const EMPTY: GridPrefs = { widths: {}, hidden: [], order: [], pinned: [] }

/** Column widths and hidden columns of one table. Missing or corrupt data reads as the defaults. */
export async function getGridPrefs(db: Db, connectionId: string, schema: string, table: string): Promise<GridPrefs> {
  const row = await db
    .selectFrom('preferences')
    .select('value')
    .where('key', '=', prefsKey(connectionId, schema, table))
    .executeTakeFirst()
  if (!row) return EMPTY
  try {
    const parsed = JSON.parse(row.value) as Partial<GridPrefs>
    return {
      widths: parsed.widths ?? {},
      hidden: parsed.hidden ?? [],
      order: parsed.order ?? [],
      pinned: parsed.pinned ?? [],
    }
  } catch {
    return EMPTY
  }
}

export async function setGridPrefs(
  db: Db,
  connectionId: string,
  schema: string,
  table: string,
  prefs: GridPrefs,
): Promise<void> {
  const key = prefsKey(connectionId, schema, table)
  const value = JSON.stringify(prefs)
  await db
    .insertInto('preferences')
    .values({ key, value })
    .onConflict((oc) => oc.column('key').doUpdateSet({ value }))
    .execute()
}
