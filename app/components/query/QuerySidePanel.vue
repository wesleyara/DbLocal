<script setup lang="ts">
import type { HistoryPage, SavedQuery } from '#shared/types/saved-queries'

const props = defineProps<{ connectionId: string; activeSavedId: string | null }>()
const emit = defineEmits<{
  /** Open in a tab (a saved query keeps its id and name). */
  open: [payload: { sql: string; savedId?: string; name?: string }]
  rerun: [sql: string]
}>()
const { t } = useI18n()
const { date } = useFormat()
const toast = useToast()

const tab = ref<'saved' | 'history'>('saved')
const saved = ref<SavedQuery[]>([])
const history = ref<HistoryPage & { retention?: number }>({ entries: [], total: 0 })
const search = ref('')
const status = ref('')
const retention = ref(5000)
const loading = ref(false)
const PAGE = 50

async function loadSaved() {
  saved.value = await $fetch<SavedQuery[]>('/api/saved-queries', { query: { connectionId: props.connectionId } })
}
async function loadHistory(append = false) {
  loading.value = true
  try {
    const res = await $fetch<HistoryPage & { retention: number }>('/api/history', {
      query: {
        connectionId: props.connectionId,
        q: search.value || undefined,
        status: status.value || undefined,
        limit: PAGE,
        offset: append ? history.value.entries.length : 0,
      },
    })
    retention.value = res.retention
    history.value = append ? { total: res.total, entries: [...history.value.entries, ...res.entries] } : res
  } finally {
    loading.value = false
  }
}
async function refresh() {
  await Promise.all([loadSaved().catch(() => {}), loadHistory().catch(() => {})])
}
defineExpose({ refresh })
onMounted(refresh)
watch([search, status], () => void loadHistory())
watch(() => props.connectionId, refresh)

/** SQL as written, trimmed; the entry clamps it to a few lines until it is expanded. */
const clean = (sql: string) => sql.trim().replace(/\n{3,}/g, '\n\n')

const expanded = ref(new Set<string>())
function toggle(id: string) {
  const next = new Set(expanded.value)
  if (!next.delete(id)) next.add(id)
  expanded.value = next
}
const isLong = (sql: string) => sql.trim().split('\n').length > 3 || sql.length > 160

async function copy(sql: string) {
  await navigator.clipboard.writeText(sql)
  toast.push({ kind: 'success', title: t('query.copied') })
}

// rename
const renaming = ref<SavedQuery | null>(null)
const newName = ref('')
function startRename(q: SavedQuery) {
  renaming.value = q
  newName.value = q.name
}
async function rename() {
  if (!renaming.value || !newName.value.trim()) return
  await $fetch(`/api/saved-queries/${renaming.value.id}`, { method: 'PATCH', body: { name: newName.value.trim() } })
  renaming.value = null
  await loadSaved()
}
async function removeSaved(q: SavedQuery) {
  await $fetch(`/api/saved-queries/${q.id}`, { method: 'DELETE' })
  await loadSaved()
}

// clear history
const confirmClear = ref(false)
async function clearHistory() {
  await $fetch('/api/history', { method: 'DELETE', query: { connectionId: props.connectionId } })
  confirmClear.value = false
  await loadHistory()
}
async function saveRetention() {
  const n = Math.max(10, Math.min(100_000, Math.floor(Number(retention.value)) || 5000))
  retention.value = n
  await $fetch('/api/history/retention', { method: 'PUT', body: { retention: n } })
  await loadHistory()
}

const statusTone = (s: string) => (s === 'ok' ? 'success' : s === 'error' ? 'danger' : 'warning')
</script>

<template>
  <aside class="flex h-full min-h-0 w-96 max-w-[45vw] shrink-0 flex-col border-l border-border bg-bg-subtle" data-query-panel>
    <div class="flex border-b border-border">
      <button
        v-for="k in (['saved', 'history'] as const)"
        :key="k"
        type="button"
        class="h-8 flex-1 border-b-2 text-sm"
        :class="tab === k ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg'"
        :data-tab="k"
        @click="tab = k"
      >
        {{ t(`query.${k}`) }}
      </button>
    </div>

    <div v-if="tab === 'saved'" class="min-h-0 flex-1 overflow-auto p-2">
      <p v-if="saved.length === 0" class="p-2 text-xs text-fg-subtle">{{ t('query.noSaved') }}</p>
      <ul class="grid min-w-0 gap-1.5">
        <li
          v-for="q in saved"
          :key="q.id"
          class="min-w-0 rounded-md border px-2 py-1.5"
          :class="q.id === activeSavedId ? 'border-accent bg-accent-soft' : 'border-border bg-surface'"
          data-saved-query
        >
          <button type="button" class="block w-full text-left" @click="emit('open', { sql: q.sql, savedId: q.id, name: q.name })">
            <span class="block truncate text-sm font-medium text-fg">{{ q.name }}</span>
            <span
              class="font-data mt-0.5 block whitespace-pre-wrap break-words text-xs text-fg-muted"
              :class="!expanded.has(q.id) && 'line-clamp-3'"
            >{{ clean(q.sql) }}</span>
          </button>
          <div class="mt-1 flex items-center gap-0.5">
            <UiIconButton
              v-if="isLong(q.sql)"
              :icon="expanded.has(q.id) ? 'lucide:chevron-up' : 'lucide:chevron-down'"
              :label="expanded.has(q.id) ? t('query.collapse') : t('query.expand')"
              size="sm"
              @click="toggle(q.id)"
            />
            <UiIconButton icon="lucide:play" :label="t('query.rerun')" size="sm" @click="emit('rerun', q.sql)" />
            <UiIconButton icon="lucide:pencil" :label="t('query.rename')" size="sm" @click="startRename(q)" />
            <UiIconButton icon="lucide:copy" :label="t('query.copy')" size="sm" @click="copy(q.sql)" />
            <UiIconButton icon="lucide:trash-2" :label="t('common.delete')" size="sm" @click="removeSaved(q)" />
            <span v-if="!q.connectionId" class="ml-auto text-xs text-fg-subtle">{{ t('query.global') }}</span>
          </div>
        </li>
      </ul>
    </div>

    <div v-else class="flex min-h-0 flex-1 flex-col">
      <div class="grid gap-2 border-b border-border p-2">
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
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
        <p v-if="history.entries.length === 0" class="p-2 text-xs text-fg-subtle">{{ t('query.noHistory') }}</p>
        <ul class="grid min-w-0 gap-1.5">
          <li v-for="h in history.entries" :key="h.id" class="min-w-0 rounded-md border border-border bg-surface px-2 py-1.5" data-history-entry>
            <div class="flex items-center gap-2 text-xs text-fg-subtle">
              <UiBadge :tone="statusTone(h.status)">{{ t(`query.status.${h.status}`) }}</UiBadge>
              <span v-if="h.durationMs !== null" class="font-data">{{ h.durationMs }} ms</span>
              <span v-if="h.rowCount !== null" class="font-data">{{ t('query.rows', { count: h.rowCount }) }}</span>
              <span class="ml-auto shrink-0">{{ date(h.executedAt) }}</span>
            </div>
            <button type="button" class="mt-1 block w-full text-left" :title="t('query.openInEditor')" @click="emit('open', { sql: h.sql })">
              <span
                class="font-data block whitespace-pre-wrap break-words text-xs text-fg"
                :class="!expanded.has(String(h.id)) && 'line-clamp-3'"
              >{{ clean(h.sql) }}</span>
            </button>
            <p v-if="h.error" class="font-data mt-1 break-words text-xs text-danger" :class="!expanded.has(String(h.id)) && 'line-clamp-2'">{{ h.error }}</p>
            <div class="mt-1 flex items-center gap-0.5">
              <UiIconButton
                v-if="isLong(h.sql)"
                :icon="expanded.has(String(h.id)) ? 'lucide:chevron-up' : 'lucide:chevron-down'"
                :label="expanded.has(String(h.id)) ? t('query.collapse') : t('query.expand')"
                size="sm"
                @click="toggle(String(h.id))"
              />
              <UiIconButton icon="lucide:play" :label="t('query.rerun')" size="sm" @click="emit('rerun', h.sql)" />
              <UiIconButton icon="lucide:copy" :label="t('query.copy')" size="sm" @click="copy(h.sql)" />
            </div>
          </li>
        </ul>
        <UiButton v-if="history.entries.length < history.total" size="sm" class="mt-2 w-full" :loading="loading" @click="loadHistory(true)">
          {{ t('query.loadMore') }}
        </UiButton>
      </div>
      <div class="grid gap-2 border-t border-border p-2">
        <label class="flex items-center gap-2 text-xs text-fg-muted">
          {{ t('query.keepLast') }}
          <UiInput v-model.number="retention" type="number" mono class="!w-20" @change="saveRetention" />
        </label>
        <UiButton size="sm" variant="danger" :disabled="history.total === 0" @click="confirmClear = true">
          {{ t('query.clearHistory') }}
        </UiButton>
      </div>
    </div>

    <UiDialog :open="!!renaming" :title="t('query.rename')" @update:open="(v) => !v && (renaming = null)">
      <UiInput v-model="newName" :aria-label="t('common.name')" @keydown.enter="rename" />
      <template #footer>
        <UiButton @click="renaming = null">{{ t('common.cancel') }}</UiButton>
        <UiButton variant="primary" :disabled="!newName.trim()" @click="rename">{{ t('common.save') }}</UiButton>
      </template>
    </UiDialog>
    <UiDialog v-model:open="confirmClear" :title="t('query.clearHistory')" :description="t('query.clearHistoryConfirm')">
      <template #footer>
        <UiButton @click="confirmClear = false">{{ t('common.cancel') }}</UiButton>
        <UiButton variant="danger" @click="clearHistory">{{ t('query.clearHistory') }}</UiButton>
      </template>
    </UiDialog>
  </aside>
</template>
