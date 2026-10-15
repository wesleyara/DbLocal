import { defineStore } from 'pinia'
import { DEFAULT_QUERY_LIMIT, DEFAULT_QUERY_TIMEOUT_MS } from '#shared/types/query'

export interface QueryDraft {
  sql: string
  name: string
  /** Saved query this tab is bound to, if any. */
  savedId: string | null
  /** SQL as last saved, to tell whether the tab has unsaved changes. */
  savedSql: string | null
}

const KEY = 'dblocal-queries'
const SETTINGS_KEY = 'dblocal-query-settings'

const uid = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `q${Date.now()}${Math.random().toString(36).slice(2)}`)
    .replaceAll('-', '')
    .slice(0, 16)

/**
 * SQL editor tabs. Each tab is a draft keyed by the id in its URL (`/c/:id/:schema/q/:qid`); the
 * text is kept in localStorage as it is typed, so a reload or a closed browser loses nothing.
 */
export const useQueriesStore = defineStore('queries', () => {
  const drafts = ref<Record<string, QueryDraft>>({})
  const limit = ref(DEFAULT_QUERY_LIMIT)
  const timeoutMs = ref(DEFAULT_QUERY_TIMEOUT_MS)
  let hydrated = false

  function hydrate(): void {
    if (hydrated) return
    hydrated = true
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
      if (saved && typeof saved === 'object') drafts.value = saved
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as { limit?: number; timeoutMs?: number }
      if (Number.isInteger(settings.limit) && settings.limit! > 0) limit.value = settings.limit!
      if (Number.isInteger(settings.timeoutMs) && settings.timeoutMs! >= 100) timeoutMs.value = settings.timeoutMs!
    } catch {
      // storage unavailable: drafts live for this page load only
    }
  }

  watch(
    drafts,
    (value) => {
      if (!hydrated) return
      try {
        localStorage.setItem(KEY, JSON.stringify(value))
      } catch {
        // ignore
      }
    },
    { deep: true },
  )
  watch([limit, timeoutMs], () => {
    if (!hydrated) return
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ limit: limit.value, timeoutMs: timeoutMs.value }))
    } catch {
      // ignore
    }
  })

  /** Starts a new draft and returns its id. */
  function create(init: Partial<QueryDraft> = {}): string {
    hydrate()
    const id = uid()
    drafts.value[id] = { sql: '', name: '', savedId: null, savedSql: null, ...init }
    return id
  }

  /** The draft of an id; one is created empty when it is unknown (a link opened on another browser). */
  function ensure(id: string): QueryDraft {
    hydrate()
    if (!drafts.value[id]) drafts.value[id] = { sql: '', name: '', savedId: null, savedSql: null }
    return drafts.value[id]!
  }

  function remove(id: string): void {
    const { [id]: _gone, ...rest } = drafts.value
    drafts.value = rest
  }

  const isModified = (d: QueryDraft | undefined): boolean => !!d && d.savedId !== null && d.sql !== d.savedSql

  return { drafts, limit, timeoutMs, hydrate, create, ensure, remove, isModified }
})
