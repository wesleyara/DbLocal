import { decodeUrlState, encodeUrlState } from './grid-url'
import type { RecordKey } from './types/relations'
import type { RelationScope } from './types/rows'

/** The record open in the panel: `t` is omitted when it belongs to the table of the page. */
interface RecordParam {
  t?: string
  k: RecordKey
}

const isKey = (v: unknown): v is RecordKey =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  Object.keys(v).length > 0 &&
  Object.values(v).every((x) => typeof x === 'string' || typeof x === 'number')

/** Value of the `r` query param for a record. */
export function encodeRecord(table: string, key: RecordKey, pageTable: string): string {
  const param: RecordParam = table === pageTable ? { k: key } : { t: table, k: key }
  return encodeUrlState(param)
}

export function decodeRecord(text: string | null | undefined, pageTable: string): { table: string; key: RecordKey } | null {
  const parsed = decodeUrlState<RecordParam>(text)
  if (!parsed || !isKey(parsed.k)) return null
  return { table: typeof parsed.t === 'string' && parsed.t ? parsed.t : pageTable, key: parsed.k }
}

/** Value of the `rel` query param: "the rows related to this record". */
export const encodeScope = (scope: RelationScope): string => encodeUrlState(scope)

export function decodeScope(text: string | null | undefined): RelationScope | null {
  const parsed = decodeUrlState<RelationScope>(text)
  if (!parsed || typeof parsed.table !== 'string' || typeof parsed.relation !== 'string' || !isKey(parsed.key)) return null
  return { table: parsed.table, relation: parsed.relation, key: parsed.key }
}

/** `#42`, or `#BR/SP` for a composite key. */
export function keyLabel(key: RecordKey): string {
  return `#${Object.values(key).join('/')}`
}

/** Canonical path of a table view. Extra query params (`f`, `s`, `p`, `r`, `rel`) are appended. */
export function tablePath(connectionId: string, schema: string, table: string, query: Record<string, string | undefined> = {}): string {
  const base = `/c/${connectionId}/${encodeURIComponent(schema)}/t/${encodeURIComponent(table)}`
  const parts = Object.entries(query)
    .filter((e): e is [string, string] => e[1] !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
  return parts.length ? `${base}?${parts.join('&')}` : base
}
