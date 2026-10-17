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
  if (!row) return { positions: {}, wires: {} }
  try {
    const parsed = JSON.parse(row.value) as Partial<ErdLayout>
    const wires = parsed.wires && typeof parsed.wires === 'object' ? parsed.wires : {}
    return {
      positions: parsed.positions && typeof parsed.positions === 'object' ? parsed.positions : {},
      wires: Object.fromEntries(Object.entries(wires).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))),
    }
  } catch {
    return { positions: {}, wires: {} }
  }
}

export async function saveErdLayout(
  db: Db,
  connectionId: string,
  schema: string,
  positions: ErdLayout['positions'],
  replace = false,
  wires: Record<string, number | null> = {},
): Promise<ErdLayout> {
  const current = replace ? { positions: {}, wires: {} } : await getErdLayout(db, connectionId, schema)
  const nextWires = new Map(Object.entries(current.wires))
  for (const [id, dx] of Object.entries(wires)) {
    if (dx === null) nextWires.delete(id)
    else nextWires.set(id, Math.round(dx))
  }
  const layout: ErdLayout = { positions: { ...current.positions, ...positions }, wires: Object.fromEntries(nextWires) }
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
