import type { RecordKey, ResolvedRow, ResolveResponse } from '#shared/types/relations'

interface Target {
  connectionId: string
  schema: string
  table: string
}

const DEBOUNCE_MS = 80

/** Stable id of a row inside one table: its key values in primary key order. */
export function rowId(primaryKey: string[], row: Record<string, unknown>): string | null {
  const parts: string[] = []
  for (const name of primaryKey) {
    const v = row[name]
    if (v === null || v === undefined) return null
    parts.push(String(v))
  }
  return parts.join('\u0001')
}

export function rowKey(primaryKey: string[], row: Record<string, unknown>): RecordKey | null {
  const key: RecordKey = {}
  for (const name of primaryKey) {
    const v = row[name]
    if (typeof v !== 'string' && typeof v !== 'number') return null
    key[name] = v
  }
  return key
}

/**
 * Parents and related-record counts of the rows that are on screen. The grid reports which rows
 * are visible; the ones not resolved yet are fetched together, one request per burst, and the
 * server answers with one query per relation.
 */
export function useRelationData(target: Target, primaryKey: () => string[]) {
  const resolved = shallowRef(new Map<string, ResolvedRow>())
  /** Relation names that have been asked for, per row id, so toggling a column fetches only what is missing. */
  const asked = new Map<string, Set<string>>()
  const failed = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  const queue = new Map<string, { key: RecordKey; names: Set<string> }>()

  const url = () => `/api/c/${target.connectionId}/tables/${encodeURIComponent(target.table)}/relations/resolve`

  async function flush(): Promise<void> {
    const gen = generation
    const items = [...queue.values()]
    queue.clear()
    if (items.length === 0) return
    // One request asks for the union of relations; rows that did not need all of them just get extra data.
    const names = [...new Set(items.flatMap((i) => [...i.names]))]
    try {
      const res = await $fetch<ResolveResponse>(url(), {
        method: 'POST',
        body: { schema: target.schema, rows: items.map((i) => i.key), relations: names },
      })
      if (gen !== generation) return
      const next = new Map(resolved.value)
      const pk = primaryKey()
      items.forEach((item, index) => {
        const id = pk.map((c) => String(item.key[c])).join('\u0001')
        const prev = next.get(id)
        const row = res.rows[index]!
        next.set(id, { parents: { ...prev?.parents, ...row.parents }, counts: { ...prev?.counts, ...row.counts } })
      })
      resolved.value = next
      failed.value = false
    } catch {
      if (gen === generation) failed.value = true
    }
  }

  /** Asks for the relations of these rows, unless they are already known. */
  function ensure(rows: Record<string, unknown>[], names: string[]): void {
    if (names.length === 0) return
    const pk = primaryKey()
    for (const row of rows) {
      const id = rowId(pk, row)
      const key = rowKey(pk, row)
      if (id === null || key === null) continue
      const known = asked.get(id) ?? new Set<string>()
      const missing = names.filter((n) => !known.has(n))
      if (missing.length === 0) continue
      missing.forEach((n) => known.add(n))
      asked.set(id, known)
      const queued = queue.get(id)
      if (queued) missing.forEach((n) => queued.names.add(n))
      else queue.set(id, { key, names: new Set(missing) })
    }
    if (queue.size === 0) return
    clearTimeout(timer)
    timer = setTimeout(() => void flush(), DEBOUNCE_MS)
  }

  /** Forgets everything (after a reload or an edit), so visible rows are asked for again. */
  function reset(): void {
    generation++
    clearTimeout(timer)
    queue.clear()
    asked.clear()
    resolved.value = new Map()
  }

  function get(row: Record<string, unknown>): ResolvedRow | undefined {
    const id = rowId(primaryKey(), row)
    return id === null ? undefined : resolved.value.get(id)
  }

  onBeforeUnmount(() => clearTimeout(timer))

  return { resolved, failed, ensure, reset, get }
}
