<script setup lang="ts">
import { encodeUrlState } from '#shared/grid-url'
import { encodeRecord, keyLabel, tablePath } from '#shared/nav-url'
import type { FilterNode } from '#shared/types/rows'
import type { SearchEvent, SearchMode } from '#shared/types/search'
import { useWorkspaceStore } from '~/stores/workspace'

interface TableHit {
  table: string
  columns: string[]
  primaryKey: string[]
  rows: Record<string, unknown>[]
  truncated: boolean
}

const props = defineProps<{ connectionId: string; schema: string }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const { number } = useFormat()
const workspace = useWorkspaceStore()

const term = ref('')
const mode = ref<SearchMode>('contains')
const hits = ref<TableHit[]>([])
const errors = ref<{ table: string; message: string }[]>([])
const running = ref(false)
const finished = ref<{ searched: number; skipped: number; cancelled: boolean } | null>(null)
const failure = ref<string | null>(null)
let controller: AbortController | null = null

const modes = computed(() => [
  { value: 'contains', label: t('search.modeContains') },
  { value: 'exact', label: t('search.modeExact') },
])

function cancel(): void {
  controller?.abort()
}

async function run(): Promise<void> {
  const text = term.value.trim()
  if (!text || running.value) return
  hits.value = []
  errors.value = []
  finished.value = null
  failure.value = null
  running.value = true
  controller = new AbortController()
  try {
    const res = await fetch(`/api/c/${props.connectionId}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema: props.schema, term: text, mode: mode.value }),
      signal: controller.signal,
    })
    if (!res.ok || !res.body) {
      failure.value = t('search.failed')
      return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const handle = (line: string) => {
      if (!line.trim()) return
      const event = JSON.parse(line) as SearchEvent
      if (event.type === 'table') hits.value.push(event)
      else if (event.type === 'error') errors.value.push({ table: event.table, message: event.message })
      else if (event.type === 'done') finished.value = event
    }
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      lines.forEach(handle)
    }
    handle(buffer)
  } catch (err) {
    if ((err as Error).name === 'AbortError') finished.value = { searched: 0, skipped: 0, cancelled: true }
    else failure.value = t('search.failed')
  } finally {
    running.value = false
    controller = null
  }
}

// Closing the dialog stops the search: nothing keeps querying the database in the background.
watch(open, (value) => {
  if (!value) cancel()
})
onBeforeUnmount(cancel)

const total = computed(() => hits.value.reduce((sum, h) => sum + h.rows.length, 0))

/** Columns of a row that hold the term, so the line shows why it matched. */
function matched(hit: TableHit, row: Record<string, unknown>): { column: string; value: string }[] {
  const needle = term.value.trim().toLowerCase()
  const out: { column: string; value: string }[] = []
  for (const column of hit.columns) {
    const value = row[column]
    if (value === null || value === undefined) continue
    const text = String(value)
    const lower = text.toLowerCase()
    if (mode.value === 'exact' ? lower === needle : lower.includes(needle)) out.push({ column, value: text })
  }
  return out
}

function keyOf(hit: TableHit, row: Record<string, unknown>): Record<string, string | number> {
  return Object.fromEntries(hit.primaryKey.map((c) => [c, row[c] as string | number]))
}

function openRecord(hit: TableHit, row: Record<string, unknown>, event: MouseEvent): void {
  const key = keyOf(hit, row)
  const path = tablePath(props.connectionId, props.schema, hit.table, { r: encodeRecord(hit.table, key, hit.table) })
  const meta = {
    schema: props.schema,
    type: 'record' as const,
    title: `${hit.table} ${keyLabel(key)}`,
    icon: 'lucide:panel-right',
  }
  // The dialog stays open with ⌘ / Ctrl, so several results can be opened in a row.
  workspace.open(props.connectionId, path, meta)
  void navigateTo(path)
  if (!(event.metaKey || event.ctrlKey)) open.value = false
}

/** The table filtered by the same columns and term (an OR of the columns that were compared). */
function openTable(hit: TableHit): void {
  const text = term.value.trim()
  const conditions = hit.columns.map((column) => ({
    type: 'condition' as const,
    column,
    op: mode.value === 'exact' ? ('eq' as const) : ('contains' as const),
    value: text,
  }))
  const filter: FilterNode =
    conditions.length === 1 ? conditions[0]! : { type: 'group', logic: 'or', children: conditions }
  const path = tablePath(props.connectionId, props.schema, hit.table, { f: encodeUrlState(filter) })
  workspace.open(props.connectionId, path, {
    schema: props.schema,
    type: 'table',
    title: hit.table,
    icon: 'lucide:table-2',
  })
  void navigateTo(path)
  open.value = false
}
</script>

<template>
  <UiDialog v-model:open="open" wide :title="t('search.title')" :description="t('search.scope', { schema })">
    <form class="flex items-center gap-2" data-global-search @submit.prevent="run">
      <UiInput
        v-model="term"
        data-search-input
        data-autofocus
        class="flex-1"
        mono
        :placeholder="t('search.placeholder')"
        :aria-label="t('search.title')"
      />
      <UiSelect v-model="mode" :options="modes" />
      <UiButton v-if="!running" type="submit" variant="primary" :disabled="!term.trim()">
        <Icon name="lucide:search" class="size-3.5" />{{ t('search.run') }}
      </UiButton>
      <UiButton v-else type="button" data-search-cancel @click="cancel">
        <Icon name="lucide:square" class="size-3.5" />{{ t('search.cancel') }}
      </UiButton>
    </form>

    <div class="mt-3 max-h-[55vh] min-h-24 overflow-auto" aria-live="polite">
      <p v-if="failure" class="py-6 text-center text-sm text-danger">{{ failure }}</p>
      <p v-else-if="running && hits.length === 0" class="flex items-center justify-center gap-2 py-6 text-sm text-fg-muted">
        <UiSpinner />{{ t('search.searching') }}
      </p>
      <p v-else-if="finished && hits.length === 0" class="py-6 text-center text-sm text-fg-muted">
        {{ finished.cancelled ? t('search.cancelled') : t('search.noResults') }}
      </p>
      <p v-else-if="!running && !finished" class="py-6 text-center text-sm text-fg-subtle">{{ t('search.hint') }}</p>

      <section v-for="hit in hits" :key="hit.table" class="mb-3" :data-search-table="hit.table">
        <header class="flex items-center gap-2 border-b border-border pb-1">
          <Icon name="lucide:table-2" class="size-4 text-fg-muted" />
          <h3 class="font-data text-sm font-semibold text-fg">{{ hit.table }}</h3>
          <span class="text-xs text-fg-subtle">
            {{ hit.truncated ? t('search.firstN', { count: hit.rows.length }) : t('search.nMatches', { count: hit.rows.length }) }}
          </span>
          <button type="button" class="ml-auto text-xs text-accent hover:underline" @click="openTable(hit)">
            {{ t('search.openTable') }}
          </button>
        </header>
        <ul>
          <li v-for="(row, index) in hit.rows" :key="index">
            <button
              type="button"
              class="flex w-full items-baseline gap-3 rounded-md px-2 py-1 text-left text-sm hover:bg-surface-hover"
              :title="t('search.openRecord')"
              @click="openRecord(hit, row, $event)"
            >
              <span class="font-data shrink-0 text-xs text-fg-muted">{{ keyLabel(keyOf(hit, row)) }}</span>
              <span class="flex min-w-0 flex-wrap gap-x-4 gap-y-0.5">
                <span v-for="m in matched(hit, row)" :key="m.column" class="font-data min-w-0 truncate text-xs">
                  <span class="text-fg-subtle">{{ m.column }}</span>
                  <span class="text-fg">&nbsp;{{ m.value }}</span>
                </span>
              </span>
            </button>
          </li>
        </ul>
      </section>

      <ul v-if="errors.length" class="mt-2 space-y-0.5 text-xs text-warning">
        <li v-for="err in errors" :key="err.table">{{ t('search.tableFailed', { table: err.table }) }}</li>
      </ul>
    </div>

    <p v-if="finished || hits.length" class="mt-2 border-t border-border pt-2 text-xs text-fg-subtle">
      {{
        t('search.summary', {
          count: number(total),
          tables: number(hits.length),
          searched: number(finished?.searched ?? hits.length),
        })
      }}
      <template v-if="finished?.cancelled"> · {{ t('search.cancelled') }}</template>
      <template v-if="running"> · <Icon name="lucide:loader" class="inline size-3 animate-spin" /></template>
    </p>
  </UiDialog>
</template>
