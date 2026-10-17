<script setup lang="ts">
import type { HistoryPage } from '#shared/types/saved-queries'

/** Query history of a connection, read-only, from the table view. Opening an entry creates a draft in the SQL editor. */
const props = defineProps<{ connectionId: string; schema: string; table: string }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const { date } = useFormat()
const toast = useToast()
const queries = useQueriesStore()

const PAGE = 50
const history = ref<HistoryPage>({ entries: [], total: 0 })
const search = ref('')
const status = ref('')
const onlyTable = ref(true)
const loading = ref(false)

async function load(append = false) {
  loading.value = true
  try {
    const text = [onlyTable.value ? props.table : '', search.value].filter(Boolean).join(' ')
    const res = await $fetch<HistoryPage>('/api/history', {
      query: {
        connectionId: props.connectionId,
        q: text || undefined,
        status: status.value || undefined,
        limit: PAGE,
        offset: append ? history.value.entries.length : 0,
      },
    })
    history.value = append ? { total: res.total, entries: [...history.value.entries, ...res.entries] } : res
  } finally {
    loading.value = false
  }
}
watch(open, (v) => v && void load())
watch([search, status, onlyTable], () => open.value && void load())

const statusTone = (s: string) => (s === 'ok' ? 'success' : s === 'error' ? 'danger' : 'warning')

function toEditor(sql: string, run: boolean) {
  const qid = queries.create({ sql })
  open.value = false
  void navigateTo({
    path: `/c/${props.connectionId}/${encodeURIComponent(props.schema)}/q/${qid}`,
    query: run ? { run: '1' } : undefined,
  })
}

async function copy(sql: string) {
  await navigator.clipboard.writeText(sql)
  toast.push({ kind: 'success', title: t('query.copied') })
}
</script>

<template>
  <UiDialog v-model:open="open" wide :title="t('tableView.historyTitle')" :description="t('tableView.historyHint')">
    <div class="grid gap-3" data-history-dialog>
      <div class="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <UiInput v-model="search" :placeholder="t('query.searchHistory')" :aria-label="t('query.searchHistory')" />
        <UiSelect
          :model-value="status || 'all'"
          :options="[
            { value: 'all', label: t('query.allStatuses') },
            { value: 'ok', label: t('query.status.ok') },
            { value: 'error', label: t('query.status.error') },
            { value: 'cancelled', label: t('query.status.cancelled') },
            { value: 'timeout', label: t('query.status.timeout') },
          ]"
          @update:model-value="(v) => (status = v === 'all' || !v ? '' : v)"
        />
        <UiCheckbox v-model="onlyTable" :label="t('tableView.historyThisTable', { table })" />
      </div>

      <div v-if="loading && history.entries.length === 0" class="grid gap-1.5" aria-busy="true" data-history-skeleton>
        <UiSkeleton v-for="i in 4" :key="i" class="h-14" />
      </div>
      <p v-else-if="history.entries.length === 0" class="p-2 text-sm text-fg-subtle">{{ t('query.noHistory') }}</p>
      <ul class="grid max-h-[60vh] min-w-0 gap-1.5 overflow-y-auto">
        <li v-for="h in history.entries" :key="h.id" class="min-w-0 rounded-md border border-border bg-surface px-3 py-2" data-history-entry>
          <div class="flex items-center gap-2 text-xs text-fg-subtle">
            <UiBadge :tone="statusTone(h.status)">{{ t(`query.status.${h.status}`) }}</UiBadge>
            <span v-if="h.durationMs !== null" class="font-data">{{ h.durationMs }} ms</span>
            <span v-if="h.rowCount !== null" class="font-data">{{ t('query.rows', { count: h.rowCount }) }}</span>
            <span class="ml-auto shrink-0">{{ date(h.executedAt) }}</span>
          </div>
          <pre class="font-data mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs text-fg">{{ h.sql.trim() }}</pre>
          <p v-if="h.error" class="font-data mt-1 break-words text-xs text-danger">{{ h.error }}</p>
          <div class="mt-1 flex items-center gap-0.5">
            <UiIconButton icon="lucide:play" :label="t('query.rerun')" size="sm" data-history-rerun @click="toEditor(h.sql, true)" />
            <UiIconButton icon="lucide:terminal" :label="t('grid.openInEditor')" size="sm" data-history-open @click="toEditor(h.sql, false)" />
            <UiIconButton icon="lucide:copy" :label="t('query.copy')" size="sm" @click="copy(h.sql)" />
          </div>
        </li>
      </ul>
      <UiButton v-if="history.entries.length < history.total" size="sm" :loading="loading" @click="load(true)">
        {{ t('query.loadMore') }}
      </UiButton>
    </div>
  </UiDialog>
</template>
