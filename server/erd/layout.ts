import type { Kysely } from 'kysely'
import type { ErdLayout } from '#shared/schemas/erd'
import type { StoreSchema } from '../store/db'

type Db = Kysely<StoreSchema>

const layoutKey = (connectionId: string, schema: string) => `erd-layout|${connectionId}|${schema}`

/** Manual node positions of one connection + schema. Missing or corrupt data reads as no positions. */
export async function getErdLayout(db: Db, connectionId: string, schema: string): Promise<ErdLayout> {
  const row = await db
    .selectFrom('preferences')
    .select('value')
    .where('key', '=', layoutKey(connectionId, schema))
    .executeTakeFirst()
  if (!row) return { positions: {} }
  try {
    const parsed = JSON.parse(row.value) as Partial<ErdLayout>
    return { positions: parsed.positions && typeof parsed.positions === 'object' ? parsed.positions : {} }
  } catch {
    return { positions: {} }
  }
}

export async function saveErdLayout(
  db: Db,
  connectionId: string,
  schema: string,
  positions: ErdLayout['positions'],
  replace = false,
): Promise<ErdLayout> {
  const current = replace ? {} : (await getErdLayout(db, connectionId, schema)).positions
  const layout: ErdLayout = { positions: { ...current, ...positions } }
  const key = layoutKey(connectionId, schema)
  const value = JSON.stringify(layout)
  await db
    .insertInto('preferences')
    .values({ key, value })
    .onConflict((oc) => oc.column('key').doUpdateSet({ value }))
    .execute()
  return layout
}

/** Back to the automatic layout. */
export async function resetErdLayout(db: Db, connectionId: string, schema: string): Promise<void> {
  await db.deleteFrom('preferences').where('key', '=', layoutKey(connectionId, schema)).execute()
}
