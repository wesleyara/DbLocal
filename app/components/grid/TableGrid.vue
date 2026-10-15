<script setup lang="ts">
import type { RelationRef, SchemaColumn, SchemaTable } from '#shared/types/db'
import type { FilterCondition, FilterNode, GridPrefs } from '#shared/types/rows'
import { keyLabel } from '#shared/nav-url'
import { rowKey, useRelationData } from '~/composables/useRelationData'
import { useRelationNav } from '~/composables/useRelationNav'
import { useTableRows } from '~/composables/useTableRows'
import { useToast } from '~/composables/useToast'
import { useSchemaStore } from '~/stores/schema'
import DataGrid from './DataGrid.vue'
import CellValue from './cells/CellValue.vue'
import ForeignKeyCell from './cells/ForeignKeyCell.vue'
import RelationCountCell from './cells/RelationCountCell.vue'
import FilterBar from './FilterBar.vue'
import GridFooter from './GridFooter.vue'
import SortBar from './SortBar.vue'

const props = defineProps<{ connectionId: string; schema: string; table: SchemaTable }>()
const { t } = useI18n()
const toast = useToast()

const state = useTableRows({ connectionId: props.connectionId, schema: props.schema, table: props.table.name })
const schemaStore = useSchemaStore()
const nav = useRelationNav({ connectionId: props.connectionId, schema: props.schema })

const primaryKey = computed(() => (props.table.implicitRowid ? [] : props.table.primaryKey))
const foreignKeys = computed(() => props.table.foreignKeys.flatMap((fk) => fk.columns))
/** Without a key a row cannot be addressed for an UPDATE, so the table stays read-only (editing comes later). */
const readOnly = computed(() => primaryKey.value.length === 0)
const filtered = computed(() => state.filter.value !== null)

// ---- relations: FK chips and virtual count columns --------------------------------------------

const REL = '@rel:'
const CARDINALITY_KEY = {
  'many-to-one': 'manyToOne',
  'one-to-many': 'oneToMany',
  'one-to-one': 'oneToOne',
  'many-to-many': 'manyToMany',
} as const

const node = computed(() => schemaStore.graph?.tables[props.table.name])
/** Relations need a row key to be addressed; without one the grid stays a plain list of values. */
const keyed = computed(() => primaryKey.value.length > 0)
/** N:1 and 1:1 on the FK side: shown as chips in the FK column. */
const parentRefs = computed<RelationRef[]>(() =>
  keyed.value ? (node.value?.outgoing ?? []).filter((r) => r.cardinality !== 'many-to-many') : [],
)
/** 1:N, inverse 1:1 and N:N: shown as count columns at the end of the grid. */
const childRefs = computed<RelationRef[]>(() =>
  keyed.value ? [...(node.value?.outgoing ?? []).filter((r) => r.cardinality === 'many-to-many'), ...(node.value?.incoming ?? [])] : [],
)
/** The FK column that carries the chip of a relation: the first of its columns. */
const parentByColumn = computed(() => {
  const map = new Map<string, RelationRef>()
  for (const ref of parentRefs.value) if (!map.has(ref.columns[0]!)) map.set(ref.columns[0]!, ref)
  return map
})
const childByColumn = computed(() => new Map(childRefs.value.map((r) => [REL + r.name, r])))

const relationColumns = computed<SchemaColumn[]>(() =>
  childRefs.value.map((ref) => ({
    name: REL + ref.name,
    nativeType: t(`virtualRelations.cardinalityOptions.${CARDINALITY_KEY[ref.cardinality]}`),
    kind: 'other',
    nullable: false,
    default: null,
    isGenerated: true,
    isPrimaryKey: false,
    comment: null,
    enumValues: null,
  })),
)
const allColumns = computed<SchemaColumn[]>(() => [...props.table.columns, ...relationColumns.value])
const relationLabels = computed(() => Object.fromEntries(childRefs.value.map((r) => [REL + r.name, r.name])))
const labelOf = (name: string) => relationLabels.value[name] ?? name

const asRow = (row: unknown) => row as Record<string, unknown>
const asCount = (value: unknown) => (typeof value === 'number' ? value : undefined)
const parentOf = (ref: RelationRef, row: unknown) => relations.get(asRow(row))?.parents[ref.name]

const relations = useRelationData(
  { connectionId: props.connectionId, schema: props.schema, table: props.table.name },
  () => primaryKey.value,
)

// ---- columns: order, visibility and pins are preferences of the table ------------------------

const hidden = computed(() => new Set(state.prefs.value.hidden))
const pinnedSet = computed(() => new Set(state.prefs.value.pinned))

/** All columns in the saved order: listed ones first, in that order, then the rest in table order. */
const ordered = computed<SchemaColumn[]>(() => {
  const rank = new Map(state.prefs.value.order.map((name, i) => [name, i]))
  return allColumns.value
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

/** Relation names whose data the visible columns need: parents always, counts when the column is shown. */
const wantedRelations = computed(() => [
  ...parentRefs.value.map((r) => r.name),
  ...childRefs.value.filter((r) => !hidden.value.has(REL + r.name)).map((r) => r.name),
])

let range: [number, number] = [0, 40]
function ensureVisible(): void {
  relations.ensure(state.rows.value.slice(range[0], range[1] + 1), wantedRelations.value)
}
function onVisible(first: number, last: number): void {
  range = [first, last]
  ensureVisible()
}
watch(wantedRelations, ensureVisible)
watch(
  () => state.rows.value,
  () => {
    range = [0, 40]
    ensureVisible()
  },
)

/** Rows as the grid shows them: the table's values plus the count of every relation column. */
const gridRows = computed(() => {
  void relations.resolved.value
  if (childRefs.value.length === 0) return state.rows.value
  return state.rows.value.map((row) => {
    const data = relations.get(row)
    const out: Record<string, unknown> = { ...row }
    for (const ref of childRefs.value) out[REL + ref.name] = data?.counts[ref.name]
    return out
  })
})

function openParent(ref: RelationRef, key: Record<string, string | number>, label: string | null, newTab: boolean): void {
  void nav.openRecord(ref.target, key, label, newTab)
}

function openChildren(ref: RelationRef, row: Record<string, unknown>, count: number | undefined, newTab: boolean): void {
  const key = rowKey(primaryKey.value, row)
  if (!key) return
  void nav.openRelated(props.table.name, ref.name, key, ref.target, { count, newTab })
}

function openRow(row: Record<string, unknown>): void {
  const key = rowKey(primaryKey.value, row)
  if (!key) return
  const display = node.value?.displayColumn
  const label = display && row[display] !== null && row[display] !== undefined ? String(row[display]) : null
  void nav.openRecord(props.table.name, key, label)
}

/** Label of the relation chip: `orders of users #42`. */
const scopeLabel = computed(() => {
  const scope = state.scope.value
  if (!scope) return ''
  const ref = (schemaStore.graph?.tables[scope.table]?.outgoing ?? [])
    .concat(schemaStore.graph?.tables[scope.table]?.incoming ?? [])
    .find((r) => r.name === scope.relation)
  return t('relations.scopeChip', { target: ref?.target ?? props.table.name, table: scope.table, key: keyLabel(scope.key) })
})

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
      <span
        v-if="state.scope.value"
        class="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-accent bg-accent-soft pl-2 pr-1 text-xs text-accent"
        data-relation-chip
      >
        <Icon name="lucide:git-fork" class="size-3" />
        <span class="font-data">{{ scopeLabel }}</span>
        <button
          type="button"
          class="flex size-4 items-center justify-center rounded-sm hover:bg-accent/20"
          :aria-label="t('relations.removeScope')"
          :title="t('relations.removeScope')"
          @click="state.clearScope()"
        >
          <Icon name="lucide:x" class="size-3" />
        </button>
      </span>
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
              <span v-if="hidden.size" class="text-fg-subtle">({{ allColumns.length - hidden.size }}/{{ allColumns.length }})</span>
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
              :label="labelOf(column.name)"
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
        :rows="gridRows"
        :relation-labels="relationLabels"
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
        @hide="(name) => { const c = allColumns.find((x) => x.name === name); if (c) setColumnShown(c, false) }"
        @visible="onVisible"
        @open-row="openRow"
      >
        <template #cell="{ column, row, value }">
          <ForeignKeyCell
            v-if="parentByColumn.has(column)"
            :connection-id="connectionId"
            :schema="schema"
            :target="parentByColumn.get(column)!.target"
            :value="value"
            :virtual="parentByColumn.get(column)!.virtual"
            :parent="parentOf(parentByColumn.get(column)!, row)"
            @open="(key, newTab) => openParent(parentByColumn.get(column)!, key, parentOf(parentByColumn.get(column)!, row)?.label ?? null, newTab)"
          />
          <RelationCountCell
            v-else-if="childByColumn.has(column)"
            :count="asCount(value)"
            :noun="childByColumn.get(column)!.target"
            :virtual="childByColumn.get(column)!.virtual"
            @open="(newTab) => openChildren(childByColumn.get(column)!, asRow(row), asCount(value), newTab)"
          />
          <CellValue v-else :value="value" :kind="table.columns.find((c) => c.name === column)?.kind ?? 'other'" />
        </template>
      </DataGrid>
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
