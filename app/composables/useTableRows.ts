import type { CountResponse, FilterNode, GridPrefs, RowsResponse, SortItem } from '#shared/types/rows'
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '#shared/types/rows'
import { decodeUrlState, encodeUrlState } from '#shared/grid-url'

interface Target {
  connectionId: string
  schema: string
  table: string
}

const EMPTY_PREFS: GridPrefs = { widths: {}, hidden: [], order: [], pinned: [] }
const SAVE_DELAY_MS = 400

const isFilterNode = (v: unknown): v is FilterNode =>
  typeof v === 'object' && v !== null && 'type' in v && ((v as { type: unknown }).type === 'condition' || (v as { type: unknown }).type === 'group')

/** Rows, count, paging and grid preferences of one table. Filter, sort and paging live in the URL. */
export function useTableRows(target: Target) {
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

  const base = () => `/api/c/${target.connectionId}/tables/${encodeURIComponent(target.table)}`

  /** Drops stale responses: only the latest request of each kind may write its result. */
  let rowsSeq = 0
  let countSeq = 0

  /** Pages fetched ahead of time, keyed by their request body. Each entry is used once. */
  const prefetched = new Map<string, RowsResponse>()

  const rowsBody = (offset: number) => ({
    schema: target.schema,
    filter: filter.value,
    sort: sort.value,
    limit: pageSize.value,
    offset,
  })

  async function fetchRows(body: ReturnType<typeof rowsBody>): Promise<RowsResponse> {
    return $fetch<RowsResponse>(`${base()}/rows`, { method: 'POST', body })
  }

  async function loadRows(): Promise<void> {
    const seq = ++rowsSeq
    loading.value = true
    error.value = null
    const body = rowsBody((page.value - 1) * pageSize.value)
    const key = JSON.stringify(body)
    try {
      const hit = prefetched.get(key)
      const res = hit ?? (await fetchRows(body))
      prefetched.delete(key)
      if (seq === rowsSeq) rows.value = res.rows
    } catch (err) {
      if (seq === rowsSeq) error.value = err
    } finally {
      if (seq === rowsSeq) {
        loading.value = false
        settled.value = true
      }
    }
    prefetchNext()
  }

  /** Loads the next page in the background when there is one, so paging feels instant. */
  function prefetchNext(): void {
    if (total.value === null) return
    const nextOffset = page.value * pageSize.value
    if (nextOffset >= total.value) return
    const body = rowsBody(nextOffset)
    const key = JSON.stringify(body)
    if (prefetched.has(key)) return
    fetchRows(body)
      .then((res) => prefetched.set(key, res))
      .catch(() => {})
  }

  /** `exact: false` lets the server return the estimate for big unfiltered tables. */
  async function loadCount(exactRequested: boolean): Promise<void> {
    const seq = ++countSeq
    counting.value = true
    try {
      const res = await $fetch<CountResponse>(`${base()}/count`, {
        method: 'POST',
        body: { schema: target.schema, filter: filter.value, exact: exactRequested },
      })
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

  /** Re-reads the page and the count, dropping anything prefetched. */
  function reload(): Promise<void> {
    prefetched.clear()
    return Promise.all([loadRows(), loadCount(false)]).then(() => undefined)
  }

  watch(() => [param('f'), param('s'), param('p'), param('size')], () => void loadRows())
  watch(() => param('f'), () => void loadCount(false))

  /** Loads the grid preferences of this table. Missing preferences mean the defaults. */
  async function loadPrefs(): Promise<void> {
    try {
      prefs.value = await $fetch<GridPrefs>(`${base()}/prefs`, { query: { schema: target.schema } })
    } catch {
      prefs.value = { ...EMPTY_PREFS }
    }
  }

  let saveTimer: ReturnType<typeof setTimeout> | undefined
  /** Updates the preferences in memory at once and saves them shortly after the last change. */
  function updatePrefs(next: GridPrefs): void {
    prefs.value = next
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
    setFilter,
    setSort,
    setPage,
    setPageSize,
    countExactly,
    reload,
    updatePrefs,
    start,
  }
}
