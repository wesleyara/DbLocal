import { defineStore } from 'pinia'
import type { RoutinesResponse } from '#shared/types/routines'

/**
 * Functions, procedures and triggers of the schema being browsed. Client-only (never rendered on
 * the server): the sidebar, the table structure and the routines page share one request.
 */
export const useRoutinesStore = defineStore('routines', () => {
  const data = shallowRef<RoutinesResponse | null>(null)
  const key = ref<string | null>(null)
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<{ message: string } | null>(null)
  let seq = 0

  const keyOf = (id: string, schema: string) => `${id}\u0000${schema}`

  async function load(id: string, schema: string): Promise<void> {
    const k = keyOf(id, schema)
    if (key.value !== k) {
      data.value = null
      loaded.value = false
    }
    key.value = k
    const mine = ++seq
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<RoutinesResponse>(`/api/c/${id}/routines`, { query: { schema } })
      if (mine === seq) data.value = res
    } catch (err) {
      if (mine === seq) {
        const body = (err as { data?: { message?: string } }).data
        error.value = { message: body?.message ?? (err as Error).message }
      }
    } finally {
      if (mine === seq) {
        loading.value = false
        loaded.value = true
      }
    }
  }

  /** Loads once per connection + schema; a call while the same one is loading or loaded does nothing. */
  async function ensure(id: string, schema: string): Promise<void> {
    if (key.value === keyOf(id, schema) && (loaded.value || loading.value)) return
    await load(id, schema)
  }

  return { data, loading, loaded, error, load, ensure }
})
