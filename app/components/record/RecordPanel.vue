<script setup lang="ts">
import type { ConnectionView } from '#shared/types/connection'
import type { RelationRef, SchemaColumn } from '#shared/types/db'
import type { RecordKey, RecordResponse } from '#shared/types/relations'
import type { RowsResponse } from '#shared/types/rows'
import { editableKey } from '#shared/editable'
import { nextBoolean } from '#shared/edit-values'
import { keyLabel } from '#shared/nav-url'
import { keyId } from '#shared/pending'
import { recordAsInsert } from '#shared/record-sql'
import { useRelationNav } from '~/composables/useRelationNav'
import { useToast } from '~/composables/useToast'
import { usePendingStore } from '~/stores/pending-changes'
import { useSchemaStore } from '~/stores/schema'
import { useWorkspaceStore } from '~/stores/workspace'
import CellValue from '../grid/cells/CellValue.vue'
import CellEditor from '../grid/editors/CellEditor.vue'
import FkPicker from '../grid/editors/FkPicker.vue'
import ValueDialog from '../grid/editors/ValueDialog.vue'
import { isDefaultValue } from '../grid/row-meta'

const props = defineProps<{
  connectionId: string
  schema: string
  table: string
  recordKey: RecordKey
  connection?: Pick<ConnectionView, 'readonly' | 'readonlyGlobal'> | null
}>()
const { t } = useI18n()
const toast = useToast()
const schemaStore = useSchemaStore()
const workspace = useWorkspaceStore()
const pendingStore = usePendingStore()
const ui = useUiStore()
const nav = useRelationNav({ connectionId: props.connectionId, schema: props.schema })

const PREVIEW = 5

const tableInfo = computed(() => schemaStore.tables.find((tb) => tb.name === props.table) ?? null)
const node = computed(() => schemaStore.graph?.tables[props.table])
const displayColumn = computed(() => node.value?.displayColumn ?? null)

const loading = ref(true)
const error = ref<unknown>(null)
const data = shallowRef<RecordResponse | null>(null)
let seq = 0

async function load(): Promise<void> {
  const mine = ++seq
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<RecordResponse>(`/api/c/${props.connectionId}/tables/${encodeURIComponent(props.table)}/record`, {
      query: { schema: props.schema, pk: JSON.stringify(props.recordKey) },
    })
    if (mine === seq) data.value = res
  } catch (err) {
    if (mine === seq) {
      error.value = err
      data.value = null
    }
  } finally {
    if (mine === seq) loading.value = false
  }
}
watch(() => [props.table, JSON.stringify(props.recordKey)], load, { immediate: true })

// ---- editing the record's fields (same pending changes as the grid) ---------------------------

const tabId = computed(() => workspace.active?.id ?? '_')
const writable = computed(
  () => !!tableInfo.value && editableKey(tableInfo.value) !== null && !(props.connection?.readonly || props.connection?.readonlyGlobal),
)
const pendingRow = computed(
  () => pendingStore.peek(tabId.value)?.tables[props.table]?.rows[keyId(props.recordKey)] ?? null,
)
const isDeleted = computed(() => pendingRow.value?.deleted ?? false)
/** Value shown for a column: the pending edit when there is one, the loaded value otherwise. */
const shown = (column: SchemaColumn): unknown =>
  pendingRow.value && column.name in pendingRow.value.changes ? pendingRow.value.changes[column.name] : data.value?.row[column.name]
const changed = (column: SchemaColumn): boolean => !!pendingRow.value && column.name in pendingRow.value.changes
const editableColumn = (column: SchemaColumn): boolean => writable.value && !isDeleted.value && !column.isGenerated

function applyEdit(column: string, value: unknown): void {
  if (!data.value) return
  pendingStore.edit(tabId.value, props.table, props.recordKey, data.value.row, column, value)
}

const editingField = ref<string | null>(null)
const valueDialog = ref<{ open: boolean; column: SchemaColumn | null; value: unknown }>({ open: false, column: null, value: null })
const pickerOpen = ref(false)
const pickerRef = ref<RelationRef | null>(null)
const pickerTarget = computed(() => schemaStore.tables.find((tb) => tb.name === pickerRef.value?.target) ?? null)

function startEdit(column: SchemaColumn): void {
  if (!editableColumn(column)) return
  const ref = parentRefs.value.find((r) => r.columns.includes(column.name))
  if (ref && column.kind !== 'boolean') {
    pickerRef.value = ref
    pickerOpen.value = true
  } else if (column.kind === 'boolean') {
    applyEdit(column.name, nextBoolean(shown(column), column.nullable))
  } else if (column.kind === 'json' || column.kind === 'array') {
    valueDialog.value = { open: true, column, value: shown(column) }
  } else if (column.kind !== 'binary') {
    editingField.value = column.name
  }
}

function onFieldCommit(column: SchemaColumn, value: unknown): void {
  editingField.value = null
  applyEdit(column.name, value)
}

function onPick(target: Record<string, unknown> | null): void {
  const ref = pickerRef.value
  const targetTable = pickerTarget.value
  if (!ref || !targetTable) return
  const targetColumns = ref.targetColumns.length ? ref.targetColumns : targetTable.primaryKey
  ref.columns.forEach((column, i) => applyEdit(column, target ? (target[targetColumns[i]!] ?? null) : null))
}

const pickerNullable = computed(
  () => !!pickerRef.value && pickerRef.value.columns.every((c) => tableInfo.value?.columns.find((col) => col.name === c)?.nullable),
)

function undoAll(): void {
  pendingStore.undo(tabId.value, props.table, props.recordKey)
}

function toggleDelete(): void {
  if (!data.value) return
  pendingStore.remove(tabId.value, props.table, props.recordKey, data.value.row, !isDeleted.value)
}

/** "Create related": a new row of the child table, with the foreign key already pointing at this record. */
async function createRelated(ref: RelationRef): Promise<void> {
  if (!data.value) return
  const values: Record<string, unknown> = {}
  ref.columns.forEach((column, i) => {
    const target = ref.targetColumns[i]
    if (target) values[target] = data.value!.row[column]
  })
  pendingStore.insert(tabId.value, ref.target, values)
  await nav.openRelated(props.table, ref.name, props.recordKey, ref.target, { count: count(ref) })
}
const canCreateRelated = (ref: RelationRef): boolean => {
  if (ref.cardinality !== 'one-to-many' && ref.cardinality !== 'one-to-one') return false
  const target = schemaStore.tables.find((tb) => tb.name === ref.target)
  return writable.value && !!target && editableKey(target) !== null
}

// A save elsewhere changed the data: read the record again.
watch(
  () => pendingStore.version,
  () => void load(),
)

const label = computed(() => {
  const v = displayColumn.value ? data.value?.row[displayColumn.value] : null
  return v === null || v === undefined ? null : String(v)
})

const parentRefs = computed<RelationRef[]>(() => (node.value?.outgoing ?? []).filter((r) => r.cardinality !== 'many-to-many'))
const childRefs = computed<RelationRef[]>(() => [
  ...(node.value?.outgoing ?? []).filter((r) => r.cardinality === 'many-to-many'),
  ...(node.value?.incoming ?? []),
])

// ---- previews of related records: loaded when a relation is opened, five rows each -----------

interface Preview {
  rows: { key: RecordKey; label: string | null }[]
  loading: boolean
  failed: boolean
}
const previews = ref<Record<string, Preview>>({})
const openRelations = ref<Record<string, boolean>>({})

async function loadPreview(ref: RelationRef): Promise<void> {
  if (previews.value[ref.name]) return
  previews.value = { ...previews.value, [ref.name]: { rows: [], loading: true, failed: false } }
  const target = schemaStore.tables.find((tb) => tb.name === ref.target)
  const display = schemaStore.graph?.tables[ref.target]?.displayColumn ?? null
  if (!target) return
  const columns = [...new Set([...target.primaryKey, ...(display ? [display] : [])])]
  try {
    const res = await $fetch<RowsResponse>(`/api/c/${props.connectionId}/tables/${encodeURIComponent(ref.target)}/rows`, {
      method: 'POST',
      body: {
        schema: props.schema,
        filter: null,
        sort: [],
        limit: PREVIEW,
        offset: 0,
        columns: columns.length ? columns : undefined,
        scope: { table: props.table, relation: ref.name, key: props.recordKey },
      },
    })
    previews.value = {
      ...previews.value,
      [ref.name]: {
        loading: false,
        failed: false,
        rows: res.rows.map((row) => {
          const key: RecordKey = {}
          for (const c of target.primaryKey) key[c] = row[c] as string | number
          const text = display ? row[display] : null
          return { key, label: text === null || text === undefined ? null : String(text) }
        }),
      },
    }
  } catch {
    previews.value = { ...previews.value, [ref.name]: { rows: [], loading: false, failed: true } }
  }
}

watch(
  () => [props.table, JSON.stringify(props.recordKey)],
  () => {
    previews.value = {}
    openRelations.value = {}
  },
)

function toggleRelation(ref: RelationRef): void {
  const next = !isOpen(ref)
  openRelations.value = { ...openRelations.value, [ref.name]: next }
  if (next) void loadPreview(ref)
}
/** Relations with records start open; empty ones stay collapsed. */
function isOpen(ref: RelationRef): boolean {
  return openRelations.value[ref.name] ?? (count(ref) ?? 0) > 0
}
const count = (ref: RelationRef): number | undefined => data.value?.relations.counts[ref.name]

watch(
  [data, childRefs],
  () => {
    for (const ref of childRefs.value) if (isOpen(ref) && (count(ref) ?? 0) > 0) void loadPreview(ref)
  },
  { flush: 'post' },
)

// ---- actions ---------------------------------------------------------------------------------

function copy(text: string): void {
  void navigator.clipboard?.writeText(text).then(
    () => toast.push({ kind: 'success', title: t('record.copied') }),
    () => toast.push({ kind: 'error', title: t('record.copyFailed') }),
  )
}
const copyJson = () => data.value && copy(JSON.stringify(data.value.row, null, 2))
function copyInsert(): void {
  if (!data.value || !schemaStore.dialect) return
  const generated = tableInfo.value?.columns.filter((c) => c.isGenerated).map((c) => c.name) ?? []
  copy(recordAsInsert(schemaStore.dialect, props.schema, props.table, data.value.row, generated))
}

const canGoBack = computed(() => {
  const trail = workspace.active?.trail ?? []
  return trail.length > 1 && trail[trail.length - 1]?.kind === 'record'
})
async function goBack(): Promise<void> {
  const tab = workspace.active
  if (!tab) return
  const path = workspace.trimTrail(tab.id, tab.trail.length - 2)
  if (path) await navigateTo(path)
}

// ---- resize ----------------------------------------------------------------------------------

function startResize(event: PointerEvent): void {
  const startX = event.clientX
  const startWidth = ui.recordPanelWidth
  const onMove = (e: PointerEvent) => ui.setRecordPanelWidth(startWidth + startX - e.clientX)
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') void nav.closeRecord()
}
</script>

<template>
  <aside
    class="relative flex h-full shrink-0 flex-col border-l border-border bg-surface"
    :style="{ width: `min(${ui.recordPanelWidth}px, 90vw)` }"
    :aria-label="t('record.title')"
    data-record-panel
    tabindex="-1"
    @keydown="onKeydown"
  >
    <div
      class="absolute inset-y-0 -left-0.5 z-10 w-1 cursor-col-resize hover:bg-accent/50"
      role="separator"
      aria-orientation="vertical"
      @pointerdown.prevent="startResize"
    />

    <header class="flex items-start gap-1 border-b border-border p-3">
      <UiIconButton v-if="canGoBack" icon="lucide:arrow-left" :label="t('record.back')" size="sm" @click="goBack" />
      <div class="min-w-0 flex-1">
        <p class="font-data truncate text-xs text-fg-subtle">{{ table }}</p>
        <h2 class="font-data truncate text-sm font-semibold text-fg">
          {{ keyLabel(recordKey) }}<span v-if="label" class="font-normal text-fg-muted"> · {{ label }}</span>
        </h2>
      </div>
      <UiIconButton v-if="writable && pendingRow" icon="lucide:undo-2" :label="t('edit.undoRow')" size="sm" data-record-undo @click="undoAll" />
      <UiIconButton
        v-if="writable"
        :icon="isDeleted ? 'lucide:archive-restore' : 'lucide:trash-2'"
        :label="isDeleted ? t('edit.restoreRow') : t('edit.deleteRow')"
        size="sm"
        data-record-delete
        :disabled="!data"
        @click="toggleDelete"
      />
      <UiIconButton icon="lucide:external-link" :label="t('record.openInTab')" size="sm" @click="nav.openRecord(table, recordKey, label, true)" />
      <UiIconButton icon="lucide:braces" :label="t('record.copyJson')" size="sm" :disabled="!data" @click="copyJson" />
      <UiIconButton icon="lucide:file-code" :label="t('record.copyInsert')" size="sm" :disabled="!data" @click="copyInsert" />
      <UiIconButton icon="lucide:x" :label="t('common.close')" size="sm" @click="nav.closeRecord()" />
    </header>

    <div class="min-h-0 flex-1 overflow-auto p-3">
      <UiEmptyState v-if="error" icon="lucide:triangle-alert" :title="t('record.loadError')">
        <UiButton size="sm" variant="secondary" @click="load">{{ t('grid.retry') }}</UiButton>
      </UiEmptyState>
      <div v-else-if="loading && !data" class="grid gap-2"><UiSkeleton v-for="i in 6" :key="i" class="h-5" /></div>

      <template v-else-if="data">
        <!-- Belongs to: the parents this record points at. -->
        <section v-if="parentRefs.length" class="mb-4">
          <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">{{ t('record.belongsTo') }}</h3>
          <ul class="grid gap-1">
            <li v-for="ref in parentRefs" :key="ref.name">
              <button
                v-if="data.relations.parents[ref.name]"
                type="button"
                class="flex w-full min-w-0 items-center gap-2 rounded-md border px-2 py-1 text-left text-sm hover:bg-accent-soft"
                :class="ref.virtual ? 'border-dashed border-accent/50' : 'border-border'"
                data-parent-card
                @click="nav.openRecord(ref.target, data.relations.parents[ref.name]!.key, data.relations.parents[ref.name]!.label, $event.metaKey || $event.ctrlKey)"
              >
                <Icon name="lucide:arrow-up-right" class="size-3.5 shrink-0 text-accent" />
                <span class="font-data min-w-0 flex-1 truncate text-fg">
                  {{ keyLabel(data.relations.parents[ref.name]!.key) }}
                  <span v-if="data.relations.parents[ref.name]!.label" class="text-fg-muted"> · {{ data.relations.parents[ref.name]!.label }}</span>
                </span>
                <span class="font-data truncate text-xs text-fg-subtle">{{ ref.name }}</span>
                <UiBadge v-if="ref.virtual" tone="accent">{{ t('record.virtual') }}</UiBadge>
              </button>
              <div v-else class="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm text-fg-subtle">
                <Icon name="lucide:minus" class="size-3.5" />
                <span class="font-data truncate">{{ ref.name }}</span>
                <span class="ml-auto text-xs">{{ t('record.noParent') }}</span>
              </div>
            </li>
          </ul>
        </section>

        <!-- Fields. -->
        <section class="mb-4">
          <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">{{ t('record.fields') }}</h3>
          <dl class="font-data grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            <template v-for="column in tableInfo?.columns ?? []" :key="column.name">
              <dt class="min-w-0 truncate pt-1 text-fg-muted" :title="`${column.name}: ${column.nativeType}`">
                <Icon v-if="column.isPrimaryKey" name="lucide:key-round" class="mr-0.5 inline size-3 text-warning" />
                {{ column.name }}
                <span class="block truncate text-[10px] text-fg-subtle">{{ column.nativeType }}</span>
              </dt>
              <dd
                class="group/field flex min-w-0 items-start gap-1 break-words text-fg"
                :class="[changed(column) && 'border-l-2 border-warning bg-warning-soft pl-1', isDeleted && 'line-through opacity-60']"
                :title="changed(column) ? t('edit.was', { value: String(data.row[column.name] ?? 'NULL') }) : undefined"
                :data-field="column.name"
              >
                <CellEditor
                  v-if="editingField === column.name"
                  class="h-7 min-w-0 flex-1"
                  :column="column"
                  :value="shown(column)"
                  @commit="(v) => onFieldCommit(column, v)"
                  @cancel="editingField = null"
                />
                <span v-else-if="isDefaultValue(shown(column))" class="rounded-sm border border-border px-1 text-[10px] uppercase italic text-fg-subtle">{{ t('edit.default') }}</span>
                <CellValue v-else class="min-w-0 flex-1" :value="shown(column)" :kind="column.kind" />
                <template v-if="editableColumn(column) && editingField !== column.name">
                  <button
                    v-if="column.kind !== 'binary'"
                    type="button"
                    class="hidden size-5 shrink-0 items-center justify-center rounded-sm text-fg-subtle hover:text-accent group-hover/field:flex"
                    :aria-label="t('edit.editValue')"
                    :title="t('edit.editValue')"
                    data-field-edit
                    @click="startEdit(column)"
                  >
                    <Icon name="lucide:pencil" class="size-3" />
                  </button>
                  <button
                    v-if="column.nullable"
                    type="button"
                    class="hidden size-5 shrink-0 items-center justify-center rounded-sm text-fg-subtle hover:text-accent group-hover/field:flex"
                    :aria-label="t('edit.setNull')"
                    :title="t('edit.setNull')"
                    @click="applyEdit(column.name, null)"
                  >
                    <Icon name="lucide:circle-slash" class="size-3" />
                  </button>
                </template>
              </dd>
            </template>
          </dl>
        </section>

        <!-- Has many: counts and the first records of each relation. -->
        <section v-if="childRefs.length">
          <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">{{ t('record.hasMany') }}</h3>
          <ul class="grid gap-1">
            <li
              v-for="ref in childRefs"
              :key="ref.name"
              class="rounded-md border"
              :class="ref.virtual ? 'border-dashed border-accent/50' : 'border-border'"
              data-child-relation
            >
              <button
                type="button"
                class="flex w-full items-center gap-2 px-2 py-1 text-left text-sm"
                :aria-expanded="isOpen(ref)"
                @click="toggleRelation(ref)"
              >
                <Icon :name="isOpen(ref) ? 'lucide:chevron-down' : 'lucide:chevron-right'" class="size-3.5 shrink-0 text-fg-subtle" />
                <span class="font-data min-w-0 flex-1 truncate text-fg">{{ ref.name }}</span>
                <UiBadge v-if="ref.virtual" tone="accent">{{ t('record.virtual') }}</UiBadge>
                <span class="font-data text-xs tabular-nums" :class="(count(ref) ?? 0) === 0 ? 'text-fg-subtle' : 'text-accent'">
                  {{ count(ref) ?? '…' }}
                </span>
              </button>
              <div v-if="isOpen(ref) && (count(ref) ?? 0) > 0" class="border-t border-border px-2 py-1">
                <UiSkeleton v-if="previews[ref.name]?.loading" class="h-4" />
                <p v-else-if="previews[ref.name]?.failed" class="text-xs text-danger">{{ t('relations.previewFailed') }}</p>
                <ul v-else class="grid gap-0.5">
                  <li v-for="item in previews[ref.name]?.rows ?? []" :key="JSON.stringify(item.key)">
                    <button
                      type="button"
                      class="font-data flex w-full min-w-0 items-center gap-1 rounded-sm px-1 text-left text-xs hover:bg-accent-soft"
                      @click="nav.openRecord(ref.target, item.key, item.label, $event.metaKey || $event.ctrlKey)"
                    >
                      <Icon name="lucide:arrow-up-right" class="size-3 shrink-0 text-fg-subtle" />
                      <span class="truncate text-fg">{{ keyLabel(item.key) }}<span v-if="item.label" class="text-fg-muted"> · {{ item.label }}</span></span>
                    </button>
                  </li>
                </ul>
                <button
                  type="button"
                  class="mt-1 text-xs text-accent hover:underline"
                  @click="nav.openRelated(table, ref.name, recordKey, ref.target, { count: count(ref) })"
                >
                  {{ t('record.viewAll', { count: count(ref) ?? 0, target: ref.target }) }}
                </button>
              </div>
              <div v-if="canCreateRelated(ref)" class="border-t border-border px-2 py-1">
                <button type="button" class="text-xs text-accent hover:underline" data-create-related @click="createRelated(ref)">
                  <Icon name="lucide:plus" class="mr-0.5 inline size-3" />{{ t('edit.createRelated', { target: ref.target }) }}
                </button>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </div>
    <ValueDialog
      v-model:open="valueDialog.open"
      :column="valueDialog.column"
      :value="valueDialog.value"
      @commit="(v) => valueDialog.column && applyEdit(valueDialog.column.name, v)"
    />
    <FkPicker
      v-if="pickerTarget"
      v-model:open="pickerOpen"
      :connection-id="connectionId"
      :schema="schema"
      :target="pickerTarget"
      :display-column="schemaStore.graph?.tables[pickerTarget.name]?.displayColumn ?? null"
      :nullable="pickerNullable"
      :title="pickerRef?.name ?? pickerTarget.name"
      @pick="onPick"
    />
  </aside>
</template>
