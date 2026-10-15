import type { GridPrefs } from '#shared/types/rows'
import type { ResolvedRow } from '#shared/types/relations'

/** A tab keeps only its last view (and the last table's prefs and relations): older ones are replaced. */
export const VIEWS_PER_TAB = 1

export interface RowsEntry {
  rows: Record<string, unknown>[]
  fetchedAt: number
}

export interface CountEntry {
  total: number | null
  exact: boolean
  fetchedAt: number
}

/** Related-record data of the rows of one table, shared by every view of it in a tab. */
export interface RelationEntry {
  resolved: Map<string, ResolvedRow>
  asked: Map<string, Set<string>>
}

/** Least recently used map: reading an entry refreshes it, inserting past `max` evicts the oldest. */
export class Lru<T> {
  private readonly map = new Map<string, T>()
  constructor(private readonly max: number) {}

  get(key: string): T | undefined {
    const value = this.map.get(key)
    if (value === undefined) return undefined
    this.map.delete(key)
    this.map.set(key, value)
    return value
  }

  set(key: string, value: T): void {
    this.map.delete(key)
    this.map.set(key, value)
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string)
  }

  deleteWhere(predicate: (key: string) => boolean): void {
    for (const key of [...this.map.keys()]) if (predicate(key)) this.map.delete(key)
  }

  entries(): [string, T][] {
    return [...this.map.entries()]
  }

  get size(): number {
    return this.map.size
  }
}

/** Emptied in place: a mounted grid keeps its reference and goes on filling the same entry. */
function emptyRelations(entry: RelationEntry): void {
  entry.resolved = new Map()
  entry.asked.clear()
}

interface TabBucket {
  rows: Lru<RowsEntry>
  counts: Lru<CountEntry>
  prefs: Lru<GridPrefs>
  relations: Lru<RelationEntry>
}

/** Prefix shared by every key of one table. Keys of a connection start with `<connectionId>|`. */
export const tablePrefix = (connectionId: string, schema: string, table: string): string =>
  `${connectionId}|${schema}|${table}`

/**
 * Last loaded state of the grids, per workspace tab. Memory only: nothing here is persisted, and
 * there is no automatic revalidation (data is refreshed by reloading). Entries are keyed by table
 * prefix plus the request, so filter, sort, page, size and scope each have their own entry.
 */
export class GridCache {
  private readonly tabs = new Map<string, TabBucket>()

  private bucket(tabId: string): TabBucket {
    let b = this.tabs.get(tabId)
    if (!b) {
      b = {
        rows: new Lru(VIEWS_PER_TAB),
        counts: new Lru(VIEWS_PER_TAB),
        prefs: new Lru(VIEWS_PER_TAB),
        relations: new Lru(VIEWS_PER_TAB),
      }
      this.tabs.set(tabId, b)
    }
    return b
  }

  getRows(tabId: string, key: string): RowsEntry | undefined {
    return this.tabs.get(tabId)?.rows.get(key)
  }
  setRows(tabId: string, key: string, entry: RowsEntry): void {
    this.bucket(tabId).rows.set(key, entry)
  }

  getCount(tabId: string, key: string): CountEntry | undefined {
    return this.tabs.get(tabId)?.counts.get(key)
  }
  setCount(tabId: string, key: string, entry: CountEntry): void {
    this.bucket(tabId).counts.set(key, entry)
  }

  getPrefs(tabId: string, key: string): GridPrefs | undefined {
    return this.tabs.get(tabId)?.prefs.get(key)
  }
  setPrefs(tabId: string, key: string, prefs: GridPrefs): void {
    this.bucket(tabId).prefs.set(key, prefs)
  }

  /** The relation data of a table in this tab, created empty on first use. */
  relations(tabId: string, key: string): RelationEntry {
    const b = this.bucket(tabId)
    let entry = b.relations.get(key)
    if (!entry) {
      entry = { resolved: new Map(), asked: new Map() }
      b.relations.set(key, entry)
    }
    return entry
  }

  /** Drops rows, counts and relation data of one table in one tab (preferences are not data). */
  invalidateTable(tabId: string, prefix: string): void {
    const b = this.tabs.get(tabId)
    if (!b) return
    this.drop(b, (key) => key === prefix || key.startsWith(`${prefix}|`))
  }

  /** Drops the data of every table of a connection, in every tab. */
  invalidateConnection(connectionId: string): void {
    for (const b of this.tabs.values()) {
      this.drop(b, (key) => key.startsWith(`${connectionId}|`))
      b.prefs.deleteWhere((key) => key.startsWith(`${connectionId}|`))
    }
  }

  /** Drops the data of every tab, keeping preferences. */
  clearData(): void {
    for (const b of this.tabs.values()) this.drop(b, () => true)
  }

  private drop(b: TabBucket, hit: (key: string) => boolean): void {
    b.rows.deleteWhere(hit)
    b.counts.deleteWhere(hit)
    for (const [key, entry] of b.relations.entries()) if (hit(key)) emptyRelations(entry)
  }

  dropTab(tabId: string): void {
    this.tabs.delete(tabId)
  }

  /** Drops the tabs that no longer exist. */
  keepTabs(alive: Iterable<string>): void {
    const keep = new Set(alive)
    for (const id of [...this.tabs.keys()]) if (!keep.has(id)) this.tabs.delete(id)
  }
}
