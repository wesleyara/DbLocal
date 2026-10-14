<script setup lang="ts">
import type { SchemaColumn, SchemaTable } from '#shared/types/db'
import type { FilterCondition, FilterNode, GridPrefs } from '#shared/types/rows'
import { useTableRows } from '~/composables/useTableRows'
import { useToast } from '~/composables/useToast'
import DataGrid from './DataGrid.vue'
import FilterBar from './FilterBar.vue'
import GridFooter from './GridFooter.vue'
import SortBar from './SortBar.vue'

const props = defineProps<{ connectionId: string; schema: string; table: SchemaTable }>()
const { t } = useI18n()
const toast = useToast()

const state = useTableRows({ connectionId: props.connectionId, schema: props.schema, table: props.table.name })

const primaryKey = computed(() => (props.table.implicitRowid ? [] : props.table.primaryKey))
const foreignKeys = computed(() => props.table.foreignKeys.flatMap((fk) => fk.columns))
/** Without a key a row cannot be addressed for an UPDATE, so the table stays read-only (editing comes later). */
const readOnly = computed(() => primaryKey.value.length === 0)
const filtered = computed(() => state.filter.value !== null)

// ---- columns: order, visibility and pins are preferences of the table ------------------------

const hidden = computed(() => new Set(state.prefs.value.hidden))
const pinnedSet = computed(() => new Set(state.prefs.value.pinned))

/** All columns in the saved order: listed ones first, in that order, then the rest in table order. */
const ordered = computed<SchemaColumn[]>(() => {
  const rank = new Map(state.prefs.value.order.map((name, i) => [name, i]))
  return props.table.columns
    .map((column, index) => ({ column, key: rank.get(column.name) ?? state.prefs.value.order.length + index }))
    .sort((a, b) => a.key - b.key)
    .map((item) => item.column)
})

/** What the grid draws: visible columns, pinned ones first (the grid relies on that). */
const visibleColumns = computed(() => {
  const shown = ordered.value.filter((c) => !hidden.value.has(c.name))
  return [...shown.filter((c) => pinnedSet.value.has(c.name)), ...shown.filter((c) => !pinnedSet.value.has(c.name))]
})

function setColumnShown(column: SchemaColumn, shown: boolean | 'indeterminate'): void {
  const next = new Set(state.prefs.value.hidden)
  if (shown === true) next.delete(column.name)
  else if (visibleColumns.value.length > 1) next.add(column.name)
  state.updatePrefs({ ...state.prefs.value, hidden: [...next] })
}

/** Moves the column `from` to the place of `to`. Hidden columns keep their place after the visible ones. */
function reorder(from: string, to: string): void {
  const names = visibleColumns.value.map((c) => c.name)
  const fromIndex = names.indexOf(from)
  const toIndex = names.indexOf(to)
  if (fromIndex === -1 || toIndex === -1) return
  names.splice(fromIndex, 1)
  names.splice(toIndex, 0, from)
  const rest = ordered.value.map((c) => c.name).filter((n) => !names.includes(n))
  state.updatePrefs({ ...state.prefs.value, order: [...names, ...rest] })
}

function togglePin(name: string): void {
  const current = new Set(state.prefs.value.pinned)
  if (current.has(name)) current.delete(name)
  else current.add(name)
  // Pinned order follows the column order, so the pinned block never reshuffles by itself.
  const pinned = ordered.value.map((c) => c.name).filter((n) => current.has(n))
  state.updatePrefs({ ...state.prefs.value, pinned })
}

const columnQuery = ref('')
const matchingColumns = computed(() => {
  const q = columnQuery.value.trim().toLowerCase()
  return q ? ordered.value.filter((c) => c.name.toLowerCase().includes(q)) : ordered.value
})

function resetColumns(): void {
  const cleared: GridPrefs = { widths: {}, hidden: [], order: [], pinned: [] }
  state.updatePrefs(cleared)
}

// ---- "filter by this value": adds an equality condition to the AND list ----------------------

function conditionFor(column: SchemaColumn, value: unknown): FilterCondition | null {
  if (value === null || value === undefined) return { type: 'condition', column: column.name, op: 'is_null' }
  if (column.kind === 'boolean') {
    return { type: 'condition', column: column.name, op: value === true || value === 1 || value === '1' ? 'is_true' : 'is_false' }
  }
  if (column.kind === 'json' || column.kind === 'binary' || column.kind === 'array') return null
  const scalar = column.kind === 'number' && !Number.isNaN(Number(value)) ? Number(value) : String(value)
  return { type: 'condition', column: column.name, op: 'eq', value: scalar }
}

function filterByValue(columnName: string, value: unknown): void {
  const column = props.table.columns.find((c) => c.name === columnName)
  const condition = column ? conditionFor(column, value) : null
  if (!condition) return
  const root = state.filter.value
  const existing: FilterNode[] = root ? (root.type === 'group' && root.logic === 'and' ? root.children : [root]) : []
  state.setFilter({ type: 'group', logic: 'and', children: [...existing, condition] })
}

// ---- binary download: the full value of one cell, found by the row's primary key -------------

async function download(column: string, row: Record<string, unknown>): Promise<void> {
  const key: Record<string, string | number> = {}
  for (const name of props.table.primaryKey) {
    const value = row[name]
    if (typeof value !== 'string' && typeof value !== 'number') {
      toast.push({ kind: 'error', title: t('grid.downloadFailed') })
      return
    }
    key[name] = value
  }
  try {
    const blob = await $fetch<Blob>(`/api/c/${props.connectionId}/tables/${encodeURIComponent(props.table.name)}/blob`, {
      method: 'POST',
      body: { schema: props.schema, column, key },
      responseType: 'blob',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${props.table.name}-${column}.bin`
    link.click()
    URL.revokeObjectURL(url)
  } catch {
    toast.push({ kind: 'error', title: t('grid.downloadFailed') })
  }
}

onMounted(() => state.start())
</script>

<template>
  <section class="flex h-full min-h-0 flex-col gap-2">
    <div class="flex flex-wrap items-center gap-2">
      <FilterBar :columns="table.columns" :filter="state.filter.value" @change="state.setFilter" />

      <div class="ml-auto flex items-center gap-1">
        <UiPopover>
          <template #trigger>
            <button
              type="button"
              class="inline-flex h-6 items-center gap-1 rounded-md border border-border px-2 text-xs text-fg-muted hover:bg-surface hover:text-fg"
            >
              <Icon name="lucide:columns-3" class="size-3" />
              {{ t('grid.columns') }}
              <span v-if="hidden.size" class="text-fg-subtle">({{ table.columns.length - hidden.size }}/{{ table.columns.length }})</span>
            </button>
          </template>
          <div class="grid w-56 gap-2">
            <UiInput v-model="columnQuery" mono :placeholder="t('grid.searchColumns')" :aria-label="t('grid.searchColumns')" />
            <div class="grid max-h-64 gap-1.5 overflow-auto">
            <p v-if="matchingColumns.length === 0" class="text-xs text-fg-subtle">{{ t('grid.noColumnMatch') }}</p>
            <UiCheckbox
              v-for="column in matchingColumns"
              :key="column.name"
              :model-value="!hidden.has(column.name)"
              :label="column.name"
              @update:model-value="(v) => setColumnShown(column, v ?? false)"
            />
            <button
              v-if="hidden.size || pinnedSet.size || state.prefs.value.order.length || Object.keys(state.prefs.value.widths).length"
              type="button"
              class="mt-1 self-start text-xs text-accent hover:underline"
              @click="resetColumns"
            >{{ t('grid.resetColumns') }}</button>
            </div>
          </div>
        </UiPopover>
      </div>
    </div>

    <SortBar :sort="state.sort.value" @change="state.setSort" />

    <p v-if="readOnly" class="flex items-center gap-1.5 text-xs text-warning">
      <Icon name="lucide:info" class="size-3.5" />
      {{ t('grid.noPrimaryKey') }}
    </p>

    <div class="min-h-0 flex-1">
      <UiEmptyState v-if="state.error.value" icon="lucide:triangle-alert" :title="t('grid.loadError')">
        <UiButton size="sm" variant="secondary" @click="state.reload()">{{ t('grid.retry') }}</UiButton>
      </UiEmptyState>
      <DataGrid
        v-else
        :columns="visibleColumns"
        :pinned="state.prefs.value.pinned"
        :rows="state.rows.value"
        :sort="state.sort.value"
        :primary-key="primaryKey"
        :foreign-keys="foreignKeys"
        :widths="state.prefs.value.widths"
        :loading="state.loading.value"
        :start-index="(state.page.value - 1) * state.pageSize.value"
        @update:sort="state.setSort"
        @update:widths="(w) => state.updatePrefs({ ...state.prefs.value, widths: w })"
        @filter-by-value="filterByValue"
        @reorder="reorder"
        @toggle-pin="togglePin"
        @download="download"
        @hide="(name) => { const c = table.columns.find((x) => x.name === name); if (c) setColumnShown(c, false) }"
      />
    </div>

    <p v-if="state.settled.value && !state.error.value && state.rows.value.length === 0" class="text-xs text-fg-subtle">
      {{ filtered ? t('grid.noRowsFiltered') : t('grid.noRows') }}
    </p>

    <GridFooter
      :total="state.total.value"
      :exact="state.exact.value"
      :counting="state.counting.value"
      :page="state.page.value"
      :page-size="state.pageSize.value"
      :shown="state.rows.value.length"
      @page="state.setPage"
      @page-size="state.setPageSize"
      @count-exactly="state.countExactly"
    />
  </section>
</template>
