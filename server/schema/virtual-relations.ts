import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import type { ColumnKind, SchemaSnapshot, SchemaTable, VirtualRelationDef } from '#shared/types/db'
import { buildRelationGraph } from './relation-graph'
import type { VirtualRelationInput } from '#shared/schemas/virtual-relation'
import type { StoreSchema } from '../store/db'

type Db = Kysely<StoreSchema>

/** Stored shape of a virtual relation: the `definition` column holds this as JSON. */
type Definition = Omit<VirtualRelationDef, 'id'>

const displayKey = (connectionId: string, schema: string, table: string) =>
  `display-column|${connectionId}|${schema}|${table}`

export async function listVirtualRelations(db: Db, connectionId: string, schema: string): Promise<VirtualRelationDef[]> {
  const rows = await db
    .selectFrom('virtual_relations')
    .selectAll()
    .where('connection_id', '=', connectionId)
    .where('schema_name', '=', schema)
    .orderBy('created_at')
    .execute()
  return rows.map((r) => ({ id: r.id, ...(JSON.parse(r.definition) as Definition) }))
}

export type VirtualRelationIssueCode = 'table-not-found' | 'column-not-found' | 'incompatible-kinds' | 'duplicate'

/** Problems found in a virtual relation. The UI translates `code`; `params` fill the message. */
export interface VirtualRelationIssue {
  code: VirtualRelationIssueCode
  params: Record<string, string>
}

/**
 * Checks a virtual relation against the snapshot and the connection's other relations. `excludeId`
 * is the relation being edited, so it does not count as its own duplicate. Empty when valid.
 */
export function validateVirtualRelation(
  snapshot: SchemaSnapshot,
  input: VirtualRelationInput,
  existing: VirtualRelationDef[] = [],
  excludeId?: string,
): VirtualRelationIssue[] {
  const issues: VirtualRelationIssue[] = []
  const from = findTable(snapshot, input.fromTable)
  const to = findTable(snapshot, input.toTable)
  if (!from) issues.push({ code: 'table-not-found', params: { table: input.fromTable } })
  if (!to) issues.push({ code: 'table-not-found', params: { table: input.toTable } })
  if (!from || !to) return issues

  input.fromColumns.forEach((col, i) => {
    const toName = input.toColumns[i]!
    const fromCol = from.columns.find((c) => c.name === col)
    const toCol = to.columns.find((c) => c.name === toName)
    if (!fromCol) issues.push({ code: 'column-not-found', params: { table: from.name, column: col } })
    if (!toCol) issues.push({ code: 'column-not-found', params: { table: to.name, column: toName } })
    if (fromCol && toCol && !kindsCompatible(fromCol.kind, toCol.kind)) {
      issues.push({
        code: 'incompatible-kinds',
        params: { from: `${from.name}.${col}`, to: `${to.name}.${toName}` },
      })
    }
  })
  if (issues.length === 0 && isDuplicate(snapshot, input, existing, excludeId)) {
    issues.push({ code: 'duplicate', params: {} })
  }
  return issues
}

/** HTTP status for a set of issues: 409 when the relation already exists, 400 otherwise. */
export function issueStatus(issues: VirtualRelationIssue[]): 400 | 409 {
  return issues.some((i) => i.code === 'duplicate') ? 409 : 400
}

/** Same from/to tables and columns as a relation that already exists (physical or virtual). */
function isDuplicate(
  snapshot: SchemaSnapshot,
  input: VirtualRelationInput,
  existing: VirtualRelationDef[],
  excludeId?: string,
): boolean {
  const key = (fromTable: string, fromColumns: string[], toTable: string, toColumns: string[]) =>
    [fromTable, fromColumns.join(','), toTable, toColumns.join(',')].join('|')
  const wanted = key(input.fromTable, input.fromColumns, input.toTable, input.toColumns)
  return buildRelationGraph(snapshot, existing).relations.some(
    (r) =>
      r.id !== excludeId &&
      !r.via &&
      key(r.from.table, r.from.columns, r.to.table, r.to.columns) === wanted,
  )
}

export async function createVirtualRelation(
  db: Db,
  connectionId: string,
  input: VirtualRelationInput,
): Promise<VirtualRelationDef> {
  const def: Definition = toDefinition(input)
  const id = randomUUID()
  await db
    .insertInto('virtual_relations')
    .values({
      id,
      connection_id: connectionId,
      schema_name: input.schema,
      definition: JSON.stringify(def),
      created_at: new Date().toISOString(),
    })
    .execute()
  return { id, ...def }
}

/** Returns false when the relation does not exist for this connection. */
export async function updateVirtualRelation(
  db: Db,
  connectionId: string,
  id: string,
  input: VirtualRelationInput,
): Promise<VirtualRelationDef | null> {
  const def: Definition = toDefinition(input)
  const result = await db
    .updateTable('virtual_relations')
    .set({ definition: JSON.stringify(def), schema_name: input.schema })
    .where('id', '=', id)
    .where('connection_id', '=', connectionId)
    .executeTakeFirst()
  return Number(result.numUpdatedRows) > 0 ? { id, ...def } : null
}

export async function deleteVirtualRelation(db: Db, connectionId: string, id: string): Promise<boolean> {
  const result = await db
    .deleteFrom('virtual_relations')
    .where('id', '=', id)
    .where('connection_id', '=', connectionId)
    .executeTakeFirst()
  return Number(result.numDeletedRows) > 0
}

/** Per-table display column override, stored in `preferences`. `null` removes it (back to inferred). */
export async function setDisplayColumn(
  db: Db,
  connectionId: string,
  schema: string,
  table: string,
  column: string | null,
): Promise<void> {
  const key = displayKey(connectionId, schema, table)
  if (column === null) {
    await db.deleteFrom('preferences').where('key', '=', key).execute()
    return
  }
  await db
    .insertInto('preferences')
    .values({ key, value: column })
    .onConflict((oc) => oc.column('key').doUpdateSet({ value: column }))
    .execute()
}

export async function getDisplayOverrides(db: Db, connectionId: string, schema: string): Promise<Record<string, string>> {
  const prefix = displayKey(connectionId, schema, '')
  const rows = await db.selectFrom('preferences').select(['key', 'value']).execute()
  return Object.fromEntries(
    rows.filter((r) => r.key.startsWith(prefix)).map((r) => [r.key.slice(prefix.length), r.value]),
  )
}

// ---------------------------------------------------------------------------------------------

function toDefinition(input: VirtualRelationInput): Definition {
  return {
    name: input.name ?? null,
    fromTable: input.fromTable,
    fromColumns: input.fromColumns,
    toTable: input.toTable,
    toColumns: input.toColumns,
    cardinality: input.cardinality,
  }
}

function findTable(snapshot: SchemaSnapshot, name: string): SchemaTable | undefined {
  return snapshot.tables.find((t) => t.name === name)
}

/** Columns can be joined when their categories match. `other` is a wildcard: its type is unknown. */
export function kindsCompatible(a: ColumnKind, b: ColumnKind): boolean {
  return a === b || a === 'other' || b === 'other'
}
