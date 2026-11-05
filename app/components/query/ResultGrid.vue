<script setup lang="ts">
import type { RelationRef, SchemaColumn } from '#shared/types/db'
import { encodeRecord, encodeScope, tablePath } from '#shared/nav-url'
import { sourceTableOf } from '#shared/sql-source'
import { editableKey } from '#shared/editable'
import { fkHasNull } from '#shared/fk'
import { usePendingStore } from '~/stores/pending-changes'
import { rowKey, useRelationData } from '~/composables/useRelationData'
import { useSchemaStore } from '~/stores/schema'
import { useWorkspaceStore } from '~/stores/workspace'
import DataGrid from '~/components/grid/DataGrid.vue'
import CellValue from '~/components/grid/cells/CellValue.vue'
import ForeignKeyCell from '~/components/grid/cells/ForeignKeyCell.vue'
import RelationCountCell from '~/components/grid/cells/RelationCountCell.vue'
import DeleteImpactDialog from '~/components/grid/DeleteImpactDialog.vue'
import FkPicker from '~/components/grid/editors/FkPicker.vue'
import { isDefaultValue } from '~/components/grid/row-meta'

const props = defineProps<{
  connectionId: string
  schema: string
  dialect: 'postgres' | 'mysql' | 'sqlite'
  sql: string
  /** Columns as the driver reported them (types guessed from the driver type). */
  columns: SchemaColumn[]
  rows: Record<string, unknown>[]
  /** The connection is read-only: nothing is offered for editing. */
  readonly?: boolean
}>()

const { t } = useI18n()
const store = useSchemaStore()
const workspace = useWorkspaceStore()
const pendingStore = usePendingStore()

const REL = '@rel:'
const CARDINALITY_KEY = {
  'many-to-one': 'manyToOne',
  'one-to-many': 'oneToMany',
  'one-to-one': 'oneToOne',
  'many-to-many': 'manyToMany',
} as const

// ---- which table the result comes from ---------------------------------------------------------
// A plain `SELECT ... FROM table` shows like the table view: real column types and keys, FK chips
// and (for `select *`) related-record counts. Anything else is a plain result set.
const source = computed(() => {
  const found = sourceTableOf(props.sql, props.dialect)
  if (!found) return null
  // `other.table` reads a different schema than the one loaded in the store.
  if (found.schema && found.schema !== props.schema && props.dialect !== 'sqlite') return null
  return found
})
const table = computed(() => (source.value ? store.tables.find((tb) => tb.name === source.value!.table && tb.kind === 'table') ?? null : null))

const resultNames = computed(() => new Set(props.columns.map((c) => c.name)))
const primaryKey = computed(() => {
  const tb = table.value
  if (!tb || tb.implicitRowid || tb.primaryKey.length === 0) return []
  return tb.primaryKey.every((c) => resultNames.value.has(c)) ? tb.primaryKey : []
})
const keyed = computed(() => primaryKey.value.length > 0)
const node = computed(() => (table.value ? store.graph?.tables[table.value.name] : undefined))

/** N:1 and 1:1 on the FK side, when the FK columns are in the result. */
const parentRefs = computed<RelationRef[]>(() =>
  keyed.value
    ? (node.value?.outgoing ?? []).filter(
        (r) => r.cardinality !== 'many-to-many' && r.columns.every((c) => resultNames.value.has(c)),
      )
    : [],
)
const childRefs = computed<RelationRef[]>(() =>
  keyed.value && source.value?.star
    ? [...(node.value?.outgoing ?? []).filter((r) => r.cardinality === 'many-to-many'), ...(node.value?.incoming ?? [])]
    : [],
)
const parentByColumn = computed(() => {
  const map = new Map<string, RelationRef>()
  for (const ref of parentRefs.value) if (!map.has(ref.columns[0]!)) map.set(ref.columns[0]!, ref)
  return map
})
const childByColumn = computed(() => new Map(childRefs.value.map((r) => [REL + r.name, r])))
const relationLabels = computed(() => Object.fromEntries(childRefs.value.map((r) => [REL + r.name, r.name])))

const gridColumns = computed<SchemaColumn[]>(() => {
  const real = new Map((table.value?.columns ?? []).map((c) => [c.name, c]))
  const base = props.columns.map((c) => {
    const own = real.get(c.name)
    // Only a column that comes straight from the table keeps its definition (aliases and
    // expressions have names that are not in the table, or are the driver's guess). Those are
    // never edited: they are marked generated.
    return own ?? (editable.value ? { ...c, isGenerated: true } : c)
  })
  const counts = childRefs.value.map<SchemaColumn>((ref) => ({
    name: REL + ref.name,
    nativeType: t(`virtualRelations.cardinalityOptions.${CARDINALITY_KEY[ref.cardinality]}`),
    kind: 'other',
    nullable: false,
    default: null,
    isGenerated: true,
    isPrimaryKey: false,
    comment: null,
    enumValues: null,
  }))
  return [...base, ...counts]
})

// ---- editing: a plain single-table result whose key is in the result ---------------------------
/** Columns that address a row (primary key or unique NOT NULL index), when they are all in the result. */
const keyColumns = computed(() => {
  const tb = table.value
  const key = tb ? editableKey(tb) : null
  return key && key.every((c) => resultNames.value.has(c)) ? key : null
})
const editable = computed(() => !props.readonly && keyColumns.value !== null)
const tabId = computed(() => workspace.active?.id ?? '_')
const editing = useGridEditing({
  table: () => (editable.value ? table.value : null),
  keyColumns: () => (editable.value ? keyColumns.value : null),
  loadedRows: () => props.rows,
  parentRefs: () => (editable.value ? parentRefs.value : []),
  tabId: () => tabId.value,
})
const { deleteKeys, deleteOpen, pickerOpen, pickerRef, pickerTarget, pickableColumns, pickerNullable } = editing

// ---- relation data of the rows in view ---------------------------------------------------------
const relations = useRelationData(
  { connectionId: props.connectionId, schema: props.schema, table: source.value?.table ?? '' },
  () => primaryKey.value,
)
const wanted = computed(() => [...parentRefs.value, ...childRefs.value].map((r) => r.name))
let range: [number, number] = [0, 40]
function ensureVisible(): void {
  if (!keyed.value) return
  relations.ensure(props.rows.slice(range[0], range[1] + 1), wanted.value)
}
function onVisible(first: number, last: number): void {
  range = [first, last]
  ensureVisible()
}
watch([wanted, () => props.rows], () => {
  range = [0, 40]
  ensureVisible()
}, { immediate: true })

const gridRows = computed<Record<string, unknown>[]>(() => {
  void relations.resolved.value
  if (childRefs.value.length === 0 && !editable.value) return props.rows
  return props.rows.map((row) => {
    const next: Record<string, unknown> = { ...row }
    if (childRefs.value.length > 0) {
      const data = relations.get(row)
      for (const ref of childRefs.value) next[REL + ref.name] = data?.counts[ref.name]
    }
    return editable.value ? editing.overlay(row, next) : next
  })
})

// A save somewhere: the parent re-runs the query; the chips read their parents again.
watch(() => pendingStore.version, () => {
  relations.reset()
  ensureVisible()
})

/** Widths dragged in this result (not saved: a result has no table preferences). */
const widths = ref<Record<string, number>>({})

// ---- navigation --------------------------------------------------------------------------------
function go(path: string, title: string, newTab: boolean): void {
  const meta = { schema: props.schema, type: 'table' as const, title, icon: 'lucide:table-2' }
  if (newTab) workspace.open(props.connectionId, path, meta)
  void navigateTo(path)
}
function openParent(ref: RelationRef, key: Record<string, string | number>, newTab: boolean): void {
  go(tablePath(props.connectionId, props.schema, ref.target, { r: encodeRecord(ref.target, key, ref.target) }), ref.target, newTab)
}
function openChildren(ref: RelationRef, row: Record<string, unknown>, newTab: boolean): void {
  const key = rowKey(primaryKey.value, row)
  if (!key || !table.value) return
  const scope = encodeScope({ table: table.value.name, relation: ref.name, key })
  go(tablePath(props.connectionId, props.schema, ref.target, { rel: scope }), ref.target, newTab)
}
function previewOf(ref: RelationRef, row: unknown) {
  if (ref.cardinality !== 'one-to-one' || !table.value) return undefined
  const key = rowKey(primaryKey.value, asRow(row))
  if (!key) return undefined
  return { connectionId: props.connectionId, schema: props.schema, table: table.value.name, relation: ref.name, key, target: ref.target }
}
function fallbackKeyOf(ref: RelationRef, value: unknown): Record<string, string | number> | null {
  if (ref.columns.length !== 1 || (typeof value !== 'string' && typeof value !== 'number')) return null
  const target = store.tables.find((tb) => tb.name === ref.target)
  const column = ref.targetColumns[0] ?? target?.primaryKey[0]
  return column ? { [column]: value } : null
}
const asRow = (row: unknown) => row as Record<string, unknown>
/** FK chip in this cell: not for a composite key with a NULL part (MATCH SIMPLE: no parent, not an orphan). */
const hasChip = (column: string, row: unknown): boolean => {
  const ref = parentByColumn.value.get(column)
  return !!ref && !(ref.columns.length > 1 && fkHasNull(ref.columns, asRow(row)))
}
const asCount = (value: unknown) => (typeof value === 'number' ? value : undefined)
const kindOf = (column: string) => gridColumns.value.find((c) => c.name === column)?.kind ?? 'other'
</script>

<template>
  <DataGrid
    :columns="gridColumns"
    :rows="gridRows"
    :sort="[]"
    :primary-key="primaryKey"
    :foreign-keys="[...parentByColumn.keys()]"
    :relation-labels="relationLabels"
    :editable="editable"
    :pickable="pickableColumns"
    :widths="widths"
    :selection-key="rows"
    :dialect="dialect"
    @update:widths="(w) => (widths = w)"
    @visible="onVisible"
    @edit="editing.applyEdit"
    @edit-foreign-key="editing.editForeignKey"
    @delete-rows="editing.requestDelete"
    @restore-rows="editing.restoreRows"
    @undo-row="editing.undoRow"
  >
    <template #cell="{ column, row, value }">
      <span
        v-if="isDefaultValue(value)"
        class="rounded-sm border border-border px-1 text-[10px] uppercase tracking-wide text-fg-subtle italic"
        data-default-badge
      >{{ t('edit.default') }}</span>
      <ForeignKeyCell
        v-else-if="hasChip(column, row)"
        :connection-id="connectionId"
        :schema="schema"
        :target="parentByColumn.get(column)!.target"
        :value="value"
        :virtual="parentByColumn.get(column)!.virtual"
        :relation="parentByColumn.get(column)!"
        :parent="relations.get(asRow(row))?.parents[parentByColumn.get(column)!.name]"
        :fallback-key="fallbackKeyOf(parentByColumn.get(column)!, value)"
        @open="(key, newTab) => openParent(parentByColumn.get(column)!, key, newTab)"
      />
      <RelationCountCell
        v-else-if="childByColumn.has(column)"
        :count="asCount(value)"
        :noun="childByColumn.get(column)!.target"
        :virtual="childByColumn.get(column)!.virtual"
        :preview="previewOf(childByColumn.get(column)!, row)"
        @open="(newTab) => openChildren(childByColumn.get(column)!, asRow(row), newTab)"
      />
      <CellValue v-else :value="value" :kind="kindOf(column)" />
    </template>
  </DataGrid>

  <DeleteImpactDialog
    v-if="editable && table"
    v-model:open="deleteOpen"
    :connection-id="connectionId"
    :schema="schema"
    :table="table.name"
    :keys="deleteKeys"
    @confirm="editing.confirmDelete"
  />
  <FkPicker
    v-if="editable && pickerTarget"
    v-model:open="pickerOpen"
    :connection-id="connectionId"
    :schema="schema"
    :target="pickerTarget"
    :display-column="store.graph?.tables[pickerTarget.name]?.displayColumn ?? null"
    :nullable="pickerNullable"
    :title="pickerRef?.name ?? pickerTarget.name"
    @pick="editing.onPick"
  />
</template>
