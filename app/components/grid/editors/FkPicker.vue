<script setup lang="ts">
import type { SchemaColumn, SchemaTable } from '#shared/types/db'
import type { FilterNode, RowsResponse } from '#shared/types/rows'
import { keyLabel } from '#shared/nav-url'

/**
 * Picks the record a foreign key points at: a server-side search over the display column of the
 * target table (paged), with a preview of the highlighted record. The chosen row is handed back
 * whole; the caller copies the referenced columns into the FK columns.
 */
const props = defineProps<{
  connectionId: string
  schema: string
  target: SchemaTable
  displayColumn: string | null
  /** Offer "NULL" (the FK column is nullable). */
  nullable: boolean
  title: string
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ pick: [row: Record<string, unknown> | null] }>()
const { t } = useI18n()

const PAGE = 20
const PREVIEW_FIELDS = 8

const query = ref('')
const rows = ref<Record<string, unknown>[]>([])
const loading = ref(false)
const failed = ref(false)
const more = ref(false)
const highlighted = ref<Record<string, unknown> | null>(null)

const previewColumns = computed<SchemaColumn[]>(() =>
  props.target.columns.filter((c) => c.kind !== 'binary' && c.kind !== 'json' && c.kind !== 'array').slice(0, PREVIEW_FIELDS),
)
const wanted = computed(() => [
  ...new Set([...props.target.primaryKey, ...(props.displayColumn ? [props.displayColumn] : []), ...previewColumns.value.map((c) => c.name)]),
])

function filterFor(text: string): FilterNode | null {
  const q = text.trim()
  if (!q) return null
  const conditions: FilterNode[] = []
  const display = props.target.columns.find((c) => c.name === props.displayColumn)
  if (display && (display.kind === 'string' || display.kind === 'uuid' || display.kind === 'other')) {
    conditions.push({ type: 'condition', column: display.name, op: 'contains', value: q })
  }
  const pk = props.target.primaryKey.length === 1 ? props.target.columns.find((c) => c.name === props.target.primaryKey[0]) : undefined
  if (pk) {
    if (pk.kind === 'number' && /^-?\d+$/.test(q)) conditions.push({ type: 'condition', column: pk.name, op: 'eq', value: Number(q) })
    else if ((pk.kind === 'string' || pk.kind === 'uuid') && pk.name !== display?.name) {
      conditions.push({ type: 'condition', column: pk.name, op: 'contains', value: q })
    }
  }
  if (conditions.length === 0) return null
  return conditions.length === 1 ? conditions[0]! : { type: 'group', logic: 'or', children: conditions }
}

let seq = 0
async function load(reset: boolean): Promise<void> {
  const mine = ++seq
  loading.value = true
  failed.value = false
  try {
    const res = await $fetch<RowsResponse>(`/api/c/${props.connectionId}/tables/${encodeURIComponent(props.target.name)}/rows`, {
      method: 'POST',
      body: {
        schema: props.schema,
        filter: filterFor(query.value),
        sort: props.displayColumn ? [{ column: props.displayColumn, direction: 'asc' }] : [],
        limit: PAGE + 1,
        offset: reset ? 0 : rows.value.length,
        columns: wanted.value,
      },
    })
    if (mine !== seq) return
    more.value = res.rows.length > PAGE
    const page = res.rows.slice(0, PAGE)
    rows.value = reset ? page : [...rows.value, ...page]
    if (reset) highlighted.value = page[0] ?? null
  } catch {
    if (mine === seq) failed.value = true
  } finally {
    if (mine === seq) loading.value = false
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(query, () => {
  clearTimeout(timer)
  timer = setTimeout(() => void load(true), 250)
})
watch(open, (isOpen) => {
  if (isOpen) {
    query.value = ''
    rows.value = []
    highlighted.value = null
    void load(true)
  }
})
onBeforeUnmount(() => clearTimeout(timer))

const keyOf = (row: Record<string, unknown>) =>
  Object.fromEntries(props.target.primaryKey.map((c) => [c, row[c] as string | number])) as Record<string, string | number>
const labelOf = (row: Record<string, unknown>) => {
  const v = props.displayColumn ? row[props.displayColumn] : null
  return v === null || v === undefined ? null : String(v)
}

function pick(row: Record<string, unknown> | null): void {
  emit('pick', row)
  open.value = false
}
</script>

<template>
  <UiDialog v-model:open="open" :title="title" :description="t('edit.fkPickerHint', { table: target.name })">
    <UiInput v-model="query" :placeholder="t('edit.fkSearch')" :aria-label="t('edit.fkSearch')" data-fk-search />
    <div class="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,12rem)] gap-2">
      <ul class="max-h-64 min-h-32 overflow-auto rounded-md border border-border" role="listbox" :aria-label="target.name">
        <li v-if="loading && rows.length === 0" class="p-2"><UiSkeleton class="h-4" /></li>
        <li v-else-if="failed" class="p-2 text-xs text-danger">{{ t('grid.loadError') }}</li>
        <li v-else-if="rows.length === 0" class="p-2 text-xs text-fg-subtle">{{ t('edit.fkNoMatch') }}</li>
        <li v-for="row in rows" :key="JSON.stringify(keyOf(row))">
          <button
            type="button"
            role="option"
            :aria-selected="highlighted === row"
            class="font-data flex w-full min-w-0 items-center gap-1 px-2 py-1 text-left text-xs hover:bg-accent-soft"
            :class="highlighted === row && 'bg-accent-soft'"
            data-fk-option
            @mouseenter="highlighted = row"
            @focus="highlighted = row"
            @click="pick(row)"
          >
            <span class="truncate text-fg">{{ keyLabel(keyOf(row)) }}<span v-if="labelOf(row)" class="text-fg-muted"> · {{ labelOf(row) }}</span></span>
          </button>
        </li>
        <li v-if="more" class="p-1">
          <UiButton size="sm" variant="ghost" :loading="loading" @click="load(false)">{{ t('edit.fkMore') }}</UiButton>
        </li>
      </ul>
      <dl v-if="highlighted" class="font-data max-h-64 overflow-auto rounded-md border border-border bg-bg-subtle p-2 text-[11px]" data-fk-preview>
        <template v-for="column in previewColumns" :key="column.name">
          <dt class="truncate text-fg-subtle">{{ column.name }}</dt>
          <dd class="mb-1 truncate text-fg">{{ highlighted[column.name] === null ? 'NULL' : String(highlighted[column.name]) }}</dd>
        </template>
      </dl>
    </div>
    <template #footer>
      <UiButton v-if="nullable" size="sm" variant="secondary" @click="pick(null)">{{ t('edit.setNull') }}</UiButton>
      <UiButton size="sm" variant="secondary" @click="open = false">{{ t('common.cancel') }}</UiButton>
    </template>
  </UiDialog>
</template>
