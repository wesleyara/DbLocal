import type { QueryResponse } from '#shared/types/query'
import { usePendingStore } from '~/stores/pending-changes'
import { useRoutinesStore } from '~/stores/routines'
import { useSchemaStore } from '~/stores/schema'

/**
 * Runs a structure script (built by `shared/ddl.ts`) through the raw SQL endpoint, after the
 * "alert before run" dialog has shown it: `request` opens the dialog, `confirm` runs. On success
 * the schema is read again and the grids reload, since columns may have changed under them.
 */
export function useDdlRunner(connectionId: () => string, schema: () => string) {
  const schemaStore = useSchemaStore()
  const pendingStore = usePendingStore()
  const routinesStore = useRoutinesStore()
  /** The script waiting for confirmation (`RunConfirmDialog`'s `sql`). */
  const pendingSql = ref<string | null>(null)
  const running = ref(false)
  const failure = ref<string | null>(null)

  function request(sql: string): void {
    failure.value = null
    pendingSql.value = sql
  }

  function cancel(): void {
    pendingSql.value = null
  }

  async function confirm(sql: string): Promise<boolean> {
    pendingSql.value = null
    running.value = true
    failure.value = null
    try {
      const res = await $fetch<QueryResponse>(`/api/c/${connectionId()}/query`, {
        method: 'POST',
        body: { sql, schema: schema(), confirmWrites: true },
      })
      const failed = res.statements.find((s) => s.status !== 'ok' && s.status !== 'skipped')
      if (failed) {
        failure.value = `${failed.error?.message ?? failed.status}\n${failed.sql}`
        return false
      }
      await schemaStore.load(connectionId(), schema(), true).catch(() => {})
      void routinesStore.load(connectionId(), schema()).catch(() => {})
      pendingStore.version++
      return true
    } catch (err) {
      failure.value = (err as { data?: { message?: string }; message?: string }).data?.message ?? (err as Error).message
      return false
    } finally {
      running.value = false
    }
  }

  return { pendingSql, running, failure, request, cancel, confirm }
}
