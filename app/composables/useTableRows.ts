import type { CountResponse, FilterNode, GridPrefs, RowsResponse, SortItem } from '#shared/types/rows'
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '#shared/types/rows'
import { decodeUrlState, encodeUrlState } from '#shared/grid-url'
import { decodeScope } from '#shared/nav-url'
import { tablePrefix } from '#shared/grid-cache'

interface Target {
  connectionId: string
  schema: string
  table: string
}

const EMPTY_PREFS: GridPrefs = { widths: {}, hidden: [], order: [], pinned: [] }
const SAVE_DELAY_MS = 400

const isFilterNode = (v: unknown): v is FilterNode =>
  typeof v === 'object' && v !== null && 'type' in v && ((v as { type: unknown }).type === 'condition' || (v as { type: unknown }).type === 'group')

/**
 * Rows, count, paging and grid preferences of one table. Filter, sort and paging live in the URL.
 * What was loaded is kept per workspace tab (`useGridCacheStore`): a view that is opened again is
 * shown from memory, and only `reload()` goes back to the database.
 */
export function useTableRows(target: Target, tabId: () => string = () => '_') {
  const { cache } = useGridCacheStore()
  const prefix = tablePrefix(target.connectionId, target.schema, target.table)
  const route = useRoute()
  const router = useRouter()

  const param = (name: string): string | undefined => {
    const value = route.query[name]
    return typeof value === 'string' ? value : undefined
  }

  const filter = computed<FilterNode | null>(() => {
    const parsed = decodeUrlState<unknown>(param('f'))
    return isFilterNode(parsed) ? parsed : null
  })
  const sort = computed<SortItem[]>(() => {
    const parsed = decodeUrlState<unknown>(param('s'))
    return Array.isArray(parsed) ? (parsed as SortItem[]) : []
  })
  /** "Rows related to this record": set by following a relation, shown as a removable chip. */
  const scope = computed(() => decodeScope(param('rel')))
  const pageSize = computed(() => {
    const n = Number(param('size'))
    return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE
  })
  const page = computed(() => {
    const n = Number(param('p'))
    return Number.isInteger(n) && n > 0 ? n : 1
  })

  const rows = shallowRef<Record<string, unknown>[]>([])
  const total = ref<number | null>(null)
  const exact = ref(true)
  const loading = ref(false)
  /** True once the first page has come back (success or error), so an empty grid is not shown before loading. */
  const settled = ref(false)
  const counting = ref(false)
  const error = ref<unknown>(null)
  const prefs = ref<GridPrefs>({ ...EMPTY_PREFS })
  /** When the rows on screen were read from the database (not when they were shown). */
  const fetchedAt = ref<number | null>(null)

  const base = () => `/api/c/${target.connectionId}/tables/${encodeURIComponent(target.table)}`

  /** Drops stale responses: only the latest request of each kind may write its result. */
  let rowsSeq = 0
  let countSeq = 0

  /**
   * The next page, fetched ahead of time and used once. It is not in the cache, which keeps only
   * the view on screen. `reload()` empties it.
   */
  const prefetched = new Map<string, RowsResponse>()

  const rowsBody = (offset: number) => ({
    schema: target.schema,
    filter: filter.value,
    sort: sort.value,
    limit: pageSize.value,
    offset,
    scope: scope.value,
  })

  async function fetchRows(body: ReturnType<typeof rowsBody>): Promise<RowsResponse> {
    return $fetch<RowsResponse>(`${base()}/rows`, { method: 'POST', body })
  }

  const rowsKey = (body: ReturnType<typeof rowsBody>) => `${prefix}|${JSON.stringify(body)}`

  async function loadRows(): Promise<void> {
    const seq = ++rowsSeq
    loading.value = true
    error.value = null
    const body = rowsBody((page.value - 1) * pageSize.value)
    const key = rowsKey(body)
    let fromCache = true
    try {
      let hit = cache.getRows(tabId(), key)
      if (!hit) {
        fromCache = false
        const ahead = prefetched.get(key)
        prefetched.delete(key)
        const res = ahead ?? (await fetchRows(body))
        hit = { rows: res.rows, fetchedAt: Date.now() }
        cache.setRows(tabId(), key, hit)
      }
      if (seq === rowsSeq) {
        rows.value = hit.rows
        fetchedAt.value = hit.fetchedAt
      }
    } catch (err) {
      if (seq === rowsSeq) error.value = err
    } finally {
      if (seq === rowsSeq) {
        loading.value = false
        settled.value = true
      }
    }
    // Coming back to a cached view must not touch the database: no read-ahead either.
    if (!fromCache) prefetchNext()
  }

  /** Loads the next page in the background when there is one, so paging feels instant. */
  function prefetchNext(): void {
    if (total.value === null) return
    const nextOffset = page.value * pageSize.value
    if (nextOffset >= total.value) return
    const body = rowsBody(nextOffset)
    const key = rowsKey(body)
    if (prefetched.has(key)) return
    fetchRows(body)
      .then((res) => prefetched.set(key, res))
      .catch(() => {})
  }

  /** `exact: false` lets the server return the estimate for big unfiltered tables. */
  async function loadCount(exactRequested: boolean): Promise<void> {
    const seq = ++countSeq
    const key = `${prefix}|${JSON.stringify({ filter: filter.value, scope: scope.value })}`
    const hit = exactRequested ? undefined : cache.getCount(tabId(), key)
    if (hit) {
      total.value = hit.total
      exact.value = hit.exact
      counting.value = false
      return
    }
    counting.value = true
    try {
      const res = await $fetch<CountResponse>(`${base()}/count`, {
        method: 'POST',
        body: { schema: target.schema, filter: filter.value, exact: exactRequested, scope: scope.value },
      })
      cache.setCount(tabId(), key, { total: res.count, exact: res.exact, fetchedAt: Date.now() })
      if (seq === countSeq) {
        total.value = res.count
        exact.value = res.exact
        prefetchNext()
      }
    } catch {
      if (seq === countSeq) total.value = null
    } finally {
      if (seq === countSeq) counting.value = false
    }
  }

  /** Writes one part of the URL state. Any change to filter, sort or page size goes back to page 1. */
  function patch(query: Record<string, string | undefined>): void {
    void router.replace({ query: { ...route.query, ...query } })
  }

  function setFilter(next: FilterNode | null): void {
    const empty = !next || (next.type === 'group' && next.children.length === 0)
    patch({ f: empty ? undefined : encodeUrlState(next), p: undefined })
  }

  function clearScope(): void {
    patch({ rel: undefined, p: undefined })
  }

  function setSort(next: SortItem[]): void {
    patch({ s: next.length ? encodeUrlState(next) : undefined, p: undefined })
  }

  function setPage(next: number): void {
    patch({ p: next > 1 ? String(next) : undefined })
  }

  function setPageSize(next: number): void {
    patch({ size: next === DEFAULT_PAGE_SIZE ? undefined : String(next), p: undefined })
  }

  function countExactly(): Promise<void> {
    return loadCount(true)
  }

  /** Re-reads the page and the count from the database, dropping what was cached for this table. */
  function reload(): Promise<void> {
    prefetched.clear()
    cache.invalidateTable(tabId(), prefix)
    return Promise.all([loadRows(), loadCount(false)]).then(() => undefined)
  }

  watch(() => [param('f'), param('s'), param('p'), param('size'), param('rel')], () => void loadRows())
  watch(() => [param('f'), param('rel')], () => void loadCount(false))

  /** Loads the grid preferences of this table. Missing preferences mean the defaults. */
  async function loadPrefs(): Promise<void> {
    const cached = cache.getPrefs(tabId(), prefix)
    if (cached) {
      prefs.value = cached
      return
    }
    try {
      prefs.value = await $fetch<GridPrefs>(`${base()}/prefs`, { query: { schema: target.schema } })
      cache.setPrefs(tabId(), prefix, prefs.value)
    } catch {
      prefs.value = { ...EMPTY_PREFS }
    }
  }

  let saveTimer: ReturnType<typeof setTimeout> | undefined
  /** Updates the preferences in memory at once and saves them shortly after the last change. */
  function updatePrefs(next: GridPrefs): void {
    prefs.value = next
    cache.setPrefs(tabId(), prefix, next)
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void $fetch(`${base()}/prefs`, { method: 'PUT', body: { schema: target.schema, prefs: next } }).catch(() => {})
    }, SAVE_DELAY_MS)
  }

  /** Loads the first page on the client only, so the server render stays a cheap shell. */
  function start(): void {
    void loadPrefs()
    void loadRows()
    void loadCount(false)
  }

  return {
    filter,
    sort,
    scope,
    page,
    pageSize,
    rows,
    total,
    exact,
    loading,
    settled,
    counting,
    error,
    prefs,
    fetchedAt,
    setFilter,
    setSort,
    clearScope,
    setPage,
    setPageSize,
    countExactly,
    reload,
    updatePrefs,
    start,
  }
}
