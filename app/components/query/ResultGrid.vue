<script setup lang="ts">
import type { RelationRef, SchemaColumn } from '#shared/types/db'
import { encodeRecord, encodeScope, tablePath } from '#shared/nav-url'
import { sourceTableOf } from '#shared/sql-source'
import { rowKey, useRelationData } from '~/composables/useRelationData'
import { useSchemaStore } from '~/stores/schema'
import { useWorkspaceStore } from '~/stores/workspace'
import DataGrid from '~/components/grid/DataGrid.vue'
import CellValue from '~/components/grid/cells/CellValue.vue'
import ForeignKeyCell from '~/components/grid/cells/ForeignKeyCell.vue'
import RelationCountCell from '~/components/grid/cells/RelationCountCell.vue'

const props = defineProps<{
  connectionId: string
  schema: string
  dialect: 'postgres' | 'mysql' | 'sqlite'
  sql: string
  /** Columns as the driver reported them (types guessed from the driver type). */
  columns: SchemaColumn[]
  rows: Record<string, unknown>[]
}>()

const { t } = useI18n()
const store = useSchemaStore()
const workspace = useWorkspaceStore()

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
    // expressions have names that are not in the table, or are the driver's guess).
    return own ?? c
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
  if (childRefs.value.length === 0) return props.rows
  return props.rows.map((row) => {
    const data = relations.get(row)
    const next: Record<string, unknown> = { ...row }
    for (const ref of childRefs.value) next[REL + ref.name] = data?.counts[ref.name]
    return next
  })
})

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
    :editable="false"
    :dialect="dialect"
    @visible="onVisible"
  >
    <template #cell="{ column, row, value }">
      <ForeignKeyCell
        v-if="parentByColumn.has(column)"
        :connection-id="connectionId"
        :schema="schema"
        :target="parentByColumn.get(column)!.target"
        :value="value"
        :virtual="parentByColumn.get(column)!.virtual"
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
</template>
