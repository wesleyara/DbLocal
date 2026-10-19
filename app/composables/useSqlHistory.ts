import type { HistoryPage, SavedQuery } from '#shared/types/saved-queries'

const HISTORY_LIMIT = 500

/** Per connection: SQL that ran fine (newest first), then the saved queries. Memory only. */
const cache = reactive(new Map<string, string[]>())
const inflight = new Map<string, Promise<void>>()

async function load(connectionId: string): Promise<void> {
  const [history, saved] = await Promise.all([
    $fetch<HistoryPage>('/api/history', { query: { connectionId, status: 'ok', limit: HISTORY_LIMIT } }).catch(() => null),
    $fetch<SavedQuery[]>('/api/saved-queries', { query: { connectionId } }).catch(() => []),
  ])
  const seen = new Set<string>()
  const entries: string[] = []
  for (const sql of [...(history?.entries ?? []).map((e) => e.sql), ...saved.map((q) => q.sql)]) {
    const text = sql.trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    entries.push(text)
  }
  cache.set(connectionId, entries)
}

/**
 * SQL the editor's history suggestions (zsh-autosuggestions style) are drawn from. Loaded once per
 * connection; `refresh()` after a run so the statement just executed is suggested next time.
 */
export function useSqlHistory(connectionId: MaybeRefOrGetter<string>) {
  function refresh(): Promise<void> {
    const id = toValue(connectionId)
    const running = load(id).finally(() => inflight.delete(id))
    inflight.set(id, running)
    return running
  }
  if (import.meta.client) {
    watch(() => toValue(connectionId), (id) => {
      if (!cache.has(id) && !inflight.has(id)) void refresh()
    }, { immediate: true })
  }
  const entries = computed(() => cache.get(toValue(connectionId)) ?? [])
  return { entries, refresh }
}
