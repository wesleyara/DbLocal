<script setup lang="ts">
import type { RelationRef, SchemaColumn, SchemaTable } from '#shared/types/db'
import type { ConnectionView } from '#shared/types/connection'
import type { FilterCondition, FilterNode, GridPrefs } from '#shared/types/rows'
import { editableKey, readOnlyReason } from '#shared/editable'
import { isFunctionValue } from '#shared/edit-functions'
import { generatedKeyValues } from '#shared/edit-values'
import { keyLabel } from '#shared/nav-url'
import { resultColumn } from '#shared/result-columns'
import type { QueryResponse, StatementResult } from '#shared/types/query'
import { keyId, rowErrorId, insertErrorId } from '#shared/pending'
import { rowKey, useRelationData } from '~/composables/useRelationData'
import { useRelationNav } from '~/composables/useRelationNav'
import { useTableRows } from '~/composables/useTableRows'
import { useToast } from '~/composables/useToast'
import { usePendingStore } from '~/stores/pending-changes'
import { useQueriesStore } from '~/stores/queries'
import { useSchemaStore } from '~/stores/schema'
import { useUiStore } from '~/stores/ui'
import { useWorkspaceStore } from '~/stores/workspace'
import DataGrid from './DataGrid.vue'
import CellValue from './cells/CellValue.vue'
import ForeignKeyCell from './cells/ForeignKeyCell.vue'
import RelationCountCell from './cells/RelationCountCell.vue'
import DeleteImpactDialog from './DeleteImpactDialog.vue'
import FkPicker from './editors/FkPicker.vue'
import FilterBar from './FilterBar.vue'
import GridFooter from './GridFooter.vue'
import PendingBar from './PendingBar.vue'
import SqlEditor from '~/components/query/SqlEditor.vue'
import ResultGrid from '~/components/query/ResultGrid.vue'
import { isDefaultValue, metaOf, ROW_META, type RowMeta } from './row-meta'
import SortBar from './SortBar.vue'

const props = defineProps<{
  connectionId: string
  schema: string
  table: SchemaTable
  /** The saved connection: its read-only flags and environment decide what editing is offered. */
  connection?: Pick<ConnectionView, 'name' | 'environment' | 'readonly' | 'readonlyGlobal'> | null
}>()
const emit = defineEmits<{ structure: []; history: [] }>()
const { t } = useI18n()
const { minutesAgo } = useFormat()
const toast = useToast()
const pendingStore = usePendingStore()
const workspace = useWorkspaceStore()

const state = useTableRows(
  { connectionId: props.connectionId, schema: props.schema, table: props.table.name },
  () => workspace.active?.id ?? '_',
)
const schemaStore = useSchemaStore()
const nav = useRelationNav({ connectionId: props.connectionId, schema: props.schema })

const primaryKey = computed(() => (props.table.implicitRowid ? [] : props.table.primaryKey))
const foreignKeys = computed(() => props.table.foreignKeys.flatMap((fk) => fk.columns))
const uniques = computed(() => props.table.indexes.filter((i) => i.unique && !i.primary).map((i) => i.columns))

// ---- editing: which tables and connections allow it ------------------------------------------

/** Columns that address a row for UPDATE / DELETE: the primary key, or a unique NOT NULL index. */
const keyColumns = computed(() => editableKey(props.table))
const connectionReadonly = computed(() => !!props.connection && (props.connection.readonly || props.connection.readonlyGlobal))
/** Cells can be edited: the table has a usable key and the connection is not read-only. */
const editable = computed(() => keyColumns.value !== null && !connectionReadonly.value)
/** Why the grid is read-only, for the notice under the toolbar. Null when it is editable. */
const readOnlyNotice = computed<string | null>(() => {
  const reason = readOnlyReason(props.table)
  if (reason === 'view') return t('grid.viewReadOnly')
  if (reason === 'no-key') return t('grid.noPrimaryKey')
  if (connectionReadonly.value) return t('edit.connectionReadonly')
  return null
})
const tabId = computed(() => workspace.active?.id ?? '_')
const pendingState = computed(() => pendingStore.peek(tabId.value))
const pendingTable = computed(() => pendingState.value?.tables[props.table.name] ?? null)
const pendingTotal = computed(() => pendingStore.count(tabId.value))
watch(
  pendingTotal,
  (n) => {
    if (workspace.active) workspace.setDirty(workspace.active.id, n > 0)
  },
  { immediate: true },
)
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
/** An edited FK shows the raw value: the resolved parent still describes the old one. */
const parentOf = (ref: RelationRef, row: unknown) =>
  ref.columns.some((c) => metaOf(row)?.changed[c]) || metaOf(row)?.state === 'new'
    ? undefined
    : relations.get(asRow(row))?.parents[ref.name]

const relations = useRelationData(
  { connectionId: props.connectionId, schema: props.schema, table: props.table.name },
  () => primaryKey.value,
  () => workspace.active?.id ?? '_',
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

/** Rows as the grid shows them: loaded values, pending edits on top, count columns, new rows first. */
const gridRows = computed<Record<string, unknown>[]>(() => {
  void relations.resolved.value
  const edits = pendingTable.value
  const errors = pendingState.value?.errors ?? {}
  const key = keyColumns.value
  const out: Record<string, unknown>[] = []

  for (const insert of edits?.inserts ?? []) {
    const meta: RowMeta = {
      state: 'new',
      id: insert.id,
      changed: {},
      error: errors[insertErrorId(props.table.name, insert.id)],
    }
    out.push({ ...insert.values, [ROW_META]: meta })
  }

  for (const row of state.rows.value) {
    const next: Record<string, unknown> = { ...row }
    if (childRefs.value.length > 0) {
      const data = relations.get(row)
      for (const ref of childRefs.value) next[REL + ref.name] = data?.counts[ref.name]
    }
    const rowKeyValue = key ? rowKey(key, row) : null
    const pending = rowKeyValue ? edits?.rows[keyId(rowKeyValue)] : undefined
    if (rowKeyValue && pending) {
      const changed: RowMeta['changed'] = {}
      for (const [column, value] of Object.entries(pending.changes)) {
        changed[column] = { original: row[column] }
        next[column] = value
      }
      next[ROW_META] = {
        state: pending.deleted ? 'deleted' : null,
        changed,
        key: rowKeyValue,
        error: errors[rowErrorId(props.table.name, rowKeyValue)],
      } satisfies RowMeta
    }
    out.push(next)
  }
  return out
})

/** The row as loaded from the server, by key: edits are compared against it, not against the overlay. */
const loadedByKey = computed(() => {
  const map = new Map<string, Record<string, unknown>>()
  const key = keyColumns.value
  if (!key) return map
  for (const row of state.rows.value) {
    const k = rowKey(key, row)
    if (k) map.set(keyId(k), row)
  }
  return map
})

// ---- applying edits to the pending store -----------------------------------------------------

function keyOf(row: Record<string, unknown>): Record<string, string | number> | null {
  return metaOf(row)?.key ?? (keyColumns.value ? rowKey(keyColumns.value, row) : null)
}

function applyEdit(row: Record<string, unknown>, column: string, value: unknown): void {
  const meta = metaOf(row)
  if (meta?.state === 'new' && meta.id) {
    pendingStore.editInsert(tabId.value, props.table.name, meta.id, column, value)
    return
  }
  const key = keyOf(row)
  if (!key) return
  const original = loadedByKey.value.get(keyId(key))
  if (!original) return
  pendingStore.edit(tabId.value, props.table.name, key, original, column, value)
}

function addRecord(): void {
  pendingStore.insert(tabId.value, props.table.name, generatedKeyValues(props.table.columns))
}

function duplicateRow(row: Record<string, unknown>): void {
  const values: Record<string, unknown> = {}
  for (const column of props.table.columns) {
    // Generated columns take new values; a binary value on screen is only a preview of the bytes.
    if (column.isGenerated || column.kind === 'binary') continue
    const v = row[column.name]
    if (v !== undefined) values[column.name] = v
  }
  // A copy must not repeat a key the client generates.
  pendingStore.insert(tabId.value, props.table.name, { ...values, ...generatedKeyValues(props.table.columns) })
}

function undoRow(row: Record<string, unknown>): void {
  const meta = metaOf(row)
  if (meta?.state === 'new' && meta.id) pendingStore.removeNew(tabId.value, props.table.name, meta.id)
  else {
    const key = keyOf(row)
    if (key) pendingStore.undo(tabId.value, props.table.name, key)
  }
}

// ---- deleting: new rows vanish at once, loaded rows ask with the impact first ----------------

const deleteKeys = ref<Record<string, string | number>[]>([])
const deleteOpen = ref(false)

function requestDelete(rows: Record<string, unknown>[]): void {
  const keys: Record<string, string | number>[] = []
  for (const row of rows) {
    const meta = metaOf(row)
    if (meta?.state === 'new' && meta.id) {
      pendingStore.removeNew(tabId.value, props.table.name, meta.id)
      continue
    }
    const key = keyOf(row)
    if (key && meta?.state !== 'deleted') keys.push(key)
  }
  if (keys.length === 0) return
  deleteKeys.value = keys
  deleteOpen.value = true
}

function confirmDelete(): void {
  for (const key of deleteKeys.value) {
    const original = loadedByKey.value.get(keyId(key))
    if (original) pendingStore.remove(tabId.value, props.table.name, key, original, true)
  }
  deleteKeys.value = []
}

function restoreRows(rows: Record<string, unknown>[]): void {
  for (const row of rows) {
    const key = keyOf(row)
    const original = key ? loadedByKey.value.get(keyId(key)) : undefined
    if (key && original) pendingStore.remove(tabId.value, props.table.name, key, original, false)
  }
}

// ---- foreign key editing: pick the parent record -------------------------------------------

const pickerOpen = ref(false)
const pickerRow = ref<Record<string, unknown> | null>(null)
const pickerRef = ref<RelationRef | null>(null)

/** FK columns that have a navigable parent relation: these are picked, not typed. */
const pickableColumns = computed(() => {
  const names = new Set<string>()
  for (const ref of parentRefs.value) ref.columns.forEach((c) => names.add(c))
  return [...names]
})
const columnHasDefault = (name: string): boolean => {
  const column = props.table.columns.find((c) => c.name === name)
  if (!column) return false
  // A lone integer key is filled by the database (rowid / serial / auto_increment) when omitted.
  const autoKey = column.isPrimaryKey && column.kind === 'number' && props.table.primaryKey.length === 1
  return column.default !== null || column.isGenerated || autoKey
}
const pickerTarget = computed(() => schemaStore.tables.find((tb) => tb.name === pickerRef.value?.target) ?? null)

function editForeignKey(row: Record<string, unknown>, column: string): void {
  const ref = parentRefs.value.find((r) => r.columns.includes(column))
  if (!ref || !schemaStore.tables.some((tb) => tb.name === ref.target)) return
  pickerRow.value = row
  pickerRef.value = ref
  pickerOpen.value = true
}

function onPick(target: Record<string, unknown> | null): void {
  const ref = pickerRef.value
  const row = pickerRow.value
  const targetTable = pickerTarget.value
  if (!ref || !row || !targetTable) return
  const targetColumns = ref.targetColumns.length ? ref.targetColumns : targetTable.primaryKey
  ref.columns.forEach((column, i) => {
    applyEdit(row, column, target ? (target[targetColumns[i]!] ?? null) : null)
  })
}

const pickerNullable = computed(() => {
  const ref = pickerRef.value
  return !!ref && ref.columns.every((c) => props.table.columns.find((col) => col.name === c)?.nullable)
})

// A save succeeded somewhere (this grid or the record panel): read everything again.
watch(
  () => pendingStore.version,
  () => {
    relations.reset()
    void state.reload().then(() => ensureVisible())
  },
)

/** Key of the parent from the raw FK value, for single-column FKs (the target column is the referenced one). */
function fallbackKeyOf(ref: RelationRef, value: unknown): Record<string, string | number> | null {
  if (ref.columns.length !== 1 || (typeof value !== 'string' && typeof value !== 'number')) return null
  const target = schemaStore.tables.find((tb) => tb.name === ref.target)
  const column = ref.targetColumns[0] ?? target?.primaryKey[0]
  return column ? { [column]: value } : null
}

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

/** Exports the grid's view (filter, sort, relation scope, visible columns) as a streamed file. */
async function exportTable(format: 'csv' | 'json'): Promise<void> {
  try {
    await downloadFrom(
      `/api/c/${props.connectionId}/tables/${encodeURIComponent(props.table.name)}/export`,
      {
        schema: props.schema,
        format,
        filter: state.filter.value,
        sort: state.sort.value,
        columns: visibleColumns.value.map((c) => c.name).filter((n) => !n.startsWith('@rel:')),
        scope: state.scope.value ?? null,
      },
      `${props.table.name}.${format}`,
    )
  } catch {
    toast.push({ kind: 'error', title: t('query.exportFailed') })
  }
}
const exportItems = computed(() => [
  { label: t('query.exportCsv'), icon: 'lucide:file-spreadsheet', onSelect: () => void exportTable('csv') },
  { label: t('query.exportJson'), icon: 'lucide:file-json', onSelect: () => void exportTable('json') },
])

// ---- the SQL behind the view: editable and runnable in place ---------------------------------
const ui = useUiStore()
const queries = useQueriesStore()
/** What the grid runs for the current view. */
const viewSql = ref('')
/** The text in the editor: follows the view until the user types. */
const sqlText = ref('')
const edited = ref(false)
const running = ref(false)
const queryId = ref<string | null>(null)
const adhoc = ref<{ statement: StatementResult; sql: string; queryId: string } | null>(null)
const adhocError = ref<string | null>(null)
const confirmSql = ref<{ sql: string; kinds: string[] } | null>(null)
const sqlEditor = ref<InstanceType<typeof SqlEditor> | null>(null)
let sqlTimer: ReturnType<typeof setTimeout> | undefined

const dialect = computed(() => (schemaStore.dialect ?? 'postgres') as 'postgres' | 'mysql' | 'sqlite')

async function loadViewSql(): Promise<void> {
  if (!ui.gridSql) return
  const names = visibleColumns.value.map((c) => c.name).filter((n) => !n.startsWith('@rel:'))
  const all = props.table.columns.length
  try {
    const res = await $fetch<{ sql: string }>(`/api/c/${props.connectionId}/tables/${encodeURIComponent(props.table.name)}/sql`, {
      method: 'POST',
      body: {
        schema: props.schema,
        filter: state.filter.value,
        sort: state.sort.value,
        limit: state.pageSize.value,
        offset: (state.page.value - 1) * state.pageSize.value,
        scope: state.scope.value ?? undefined,
        columns: names.length > 0 && names.length < all ? names : undefined,
      },
    })
    viewSql.value = res.sql
  } catch {
    viewSql.value = ''
  }
  // The view moved on: the editor follows it, and a previous ad hoc result no longer applies.
  if (!edited.value) {
    sqlText.value = viewSql.value
    adhoc.value = null
    adhocError.value = null
  }
}
watch(
  () => [ui.gridSql, state.filter.value, state.sort.value, state.scope.value, state.page.value, state.pageSize.value, visibleColumns.value.map((c) => c.name).join('|')],
  () => {
    clearTimeout(sqlTimer)
    sqlTimer = setTimeout(() => void loadViewSql(), 150)
  },
  { deep: true, immediate: true },
)
watch(sqlText, (value) => {
  if (value !== viewSql.value) edited.value = true
})
watch(
  () => ui.gridSql,
  (shown) => {
    if (!shown) {
      adhoc.value = null
      adhocError.value = null
    }
  },
)
onBeforeUnmount(() => clearTimeout(sqlTimer))

// "Updated 3 minutes ago": when the rows on screen were read from the database, ticking once a minute.
const now = ref(Date.now())
let nowTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => (nowTimer = setInterval(() => (now.value = Date.now()), 30_000)))
onBeforeUnmount(() => clearInterval(nowTimer))
/** Same as ⌘R: bumping the version makes every grid and record panel read the database again. */
const reloadData = () => void pendingStore.version++
const updatedAgo = computed(() => (state.fetchedAt.value === null ? null : minutesAgo(state.fetchedAt.value, now.value)))

function resetSql(): void {
  edited.value = false
  sqlText.value = viewSql.value
  adhoc.value = null
  adhocError.value = null
}

async function runSql(sql?: string, confirmWrites = false): Promise<void> {
  const text = (sql ?? sqlText.value).trim()
  if (!text || running.value) return
  running.value = true
  adhocError.value = null
  const id = `g${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`
  queryId.value = id
  try {
    const res = await $fetch<QueryResponse>(`/api/c/${props.connectionId}/query`, {
      method: 'POST',
      body: {
        sql: text,
        schema: props.schema,
        limit: queries.limit,
        timeoutMs: queries.timeoutMs,
        queryId: id,
        confirmWrites: confirmWrites || undefined,
      },
    })
    const bad = res.statements.find((s) => s.status === 'error' || s.status === 'timeout' || s.status === 'cancelled')
    const shown = res.statements.find((s) => s.status === 'ok' && s.columns.length > 0)
    if (bad?.error && !shown) adhocError.value = bad.error.message
    else if (shown) adhoc.value = { statement: shown, sql: shown.sql, queryId: res.queryId }
    else adhocError.value = t('grid.sqlNoRows')
    if (res.schemaInvalidated) await schemaStore.reload().catch(() => {})
    // A write changes what the table shows.
    if (res.statements.some((s) => s.status === 'ok' && s.columns.length === 0)) {
      // The statement may have touched any table of the connection, so other cached views are stale too.
      useGridCacheStore().cache.invalidateConnection(props.connectionId)
      state.reload()
    }
  } catch (err) {
    const data = (err as { data?: { data?: { code?: string; kinds?: string[]; message?: string } } }).data?.data
    if (data?.code === 'confirmation_required') confirmSql.value = { sql: text, kinds: data.kinds ?? [] }
    else adhocError.value = data?.message || (err as { data?: { statusMessage?: string } }).data?.statusMessage || t('errors.unknown')
  } finally {
    running.value = false
    queryId.value = null
  }
}

async function cancelSql(): Promise<void> {
  if (!queryId.value) return
  await $fetch(`/api/c/${props.connectionId}/query/${queryId.value}/cancel`, { method: 'POST' }).catch(() => {})
}

async function copyViewSql(): Promise<void> {
  try {
    await navigator.clipboard.writeText(sqlText.value)
    toast.push({ kind: 'success', title: t('query.copied') })
  } catch {
    toast.push({ kind: 'error', title: t('grid.sqlCopyFailed') })
  }
}

function openViewInEditor(): void {
  if (!sqlText.value.trim()) return
  const qid = queries.create({ sql: sqlText.value, name: props.table.name })
  void navigateTo(`/c/${props.connectionId}/${encodeURIComponent(props.schema)}/q/${qid}`)
}

const adhocColumns = computed(() => (adhoc.value?.statement.columns ?? []).map(resultColumn))

onMounted(() => state.start())
</script>

<template>
  <section class="relative flex h-full min-h-0 flex-col gap-2" data-tour="grid">
    <div class="flex flex-wrap items-center gap-2">
      <span
        v-if="state.scope.value"
        data-tour="scope"
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
      <FilterBar :columns="table.columns" :filter="state.filter.value" @change="state.setFilter">
        <template #after-advanced>
          <button
            type="button"
            class="inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs text-fg-muted hover:bg-surface hover:text-fg"
            data-toggle-structure
            @click="emit('structure')"
          >
            <Icon name="lucide:table-properties" class="size-3" />
            {{ t('grid.structureToggle') }}
          </button>
          <button
            type="button"
            class="inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs hover:bg-surface hover:text-fg"
            :class="ui.gridSql ? 'bg-surface text-fg' : 'text-fg-muted'"
            :aria-pressed="ui.gridSql"
            data-toggle-sql
            @click="ui.gridSql = !ui.gridSql"
          >
            <Icon name="lucide:code-2" class="size-3" />
            {{ t('grid.sqlToggle') }}
          </button>
          <button
            type="button"
            class="inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs text-fg-muted hover:bg-surface hover:text-fg"
            data-toggle-history
            @click="emit('history')"
          >
            <Icon name="lucide:history" class="size-3" />
            {{ t('grid.historyToggle') }}
          </button>
          <span
            v-if="updatedAgo"
            class="hidden h-6 items-center px-2 text-xs text-fg-subtle md:inline-flex"
            data-updated-at
            :title="t('grid.updatedTitle', { time: updatedAgo })"
          >
            {{ t('grid.updated', { time: updatedAgo }) }}
          </span>
          <button
            type="button"
            class="inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs text-fg-muted hover:bg-surface hover:text-fg"
            :title="t('grid.reloadTitle')"
            :aria-label="t('grid.reload')"
            data-reload
            @click="reloadData"
          >
            <Icon name="lucide:rotate-cw" class="size-3" :class="state.loading.value && 'animate-spin'" />
          </button>
        </template>
      </FilterBar>

      <div class="ml-auto flex items-center gap-1">
        <button
          v-if="editable"
          type="button"
          class="inline-flex h-6 items-center gap-1 rounded-md border border-border px-2 text-xs text-fg-muted hover:bg-surface hover:text-fg"
          data-add-record
          @click="addRecord"
        >
          <Icon name="lucide:plus" class="size-3" />
          {{ t('edit.addRecord') }}
        </button>
        <UiDropdownMenu :items="exportItems">
          <button
            type="button"
            class="inline-flex h-6 items-center gap-1 rounded-md border border-border px-2 text-xs text-fg-muted hover:bg-surface hover:text-fg"
            data-export
          >
            <Icon name="lucide:download" class="size-3" />
            {{ t('query.export') }}
          </button>
        </UiDropdownMenu>
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
            <div class="grid max-h-64 gap-2 overflow-x-hidden overflow-y-auto">
            <p v-if="matchingColumns.length === 0" class="text-xs text-fg-subtle">{{ t('grid.noColumnMatch') }}</p>
            <UiCheckbox
              v-for="column in matchingColumns"
              :key="column.name"
              :model-value="!hidden.has(column.name)"
              :label="labelOf(column.name)"
              class="font-data text-xs"
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

    <div v-if="ui.gridSql" class="rounded-md border border-border bg-bg-subtle" data-view-sql>
      <div class="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1">
        <span class="text-xs font-medium text-fg-muted">{{ t('grid.sqlTitle') }}</span>
        <span class="text-[11px] text-fg-subtle">{{ edited ? t('grid.sqlEdited') : t('grid.sqlHint') }}</span>
        <div class="ml-auto flex items-center gap-1">
          <UiButton v-if="running" size="sm" variant="danger" @click="cancelSql">{{ t('query.cancel') }}</UiButton>
          <UiButton v-else size="sm" variant="primary" :disabled="!sqlText.trim()" data-run-view-sql @click="runSql()">
            <Icon name="lucide:play" class="size-3.5" />{{ t('query.run') }}
          </UiButton>
          <UiButton v-if="edited" size="sm" variant="ghost" @click="resetSql">{{ t('grid.sqlReset') }}</UiButton>
          <UiIconButton icon="lucide:copy" :label="t('query.copy')" size="sm" :disabled="!sqlText" @click="copyViewSql" />
          <UiIconButton icon="lucide:terminal" :label="t('grid.openInEditor')" size="sm" :disabled="!sqlText.trim()" data-open-in-editor @click="openViewInEditor" />
          <UiIconButton icon="lucide:x" :label="t('grid.sqlHide')" size="sm" @click="ui.gridSql = false" />
        </div>
      </div>
      <div class="h-28">
        <ClientOnly>
          <SqlEditor
            ref="sqlEditor"
            v-model="sqlText"
            :dialect="dialect"
            :snapshot="schemaStore.snapshot"
            :graph="schemaStore.graph"
            @run="(sql) => runSql(sql)"
            @run-all="runSql()"
          />
        </ClientOnly>
      </div>
    </div>

    <p v-if="readOnlyNotice" class="flex items-center gap-1.5 text-xs text-warning" data-readonly-notice>
      <Icon name="lucide:info" class="size-3.5" />
      {{ readOnlyNotice }}
      <HelpEmptyLink v-if="readOnlyReason(table) === 'no-key'" topic="noPrimaryKey" />
    </p>

    <div class="min-h-0 flex-1">
      <div v-if="adhocError" class="m-1 rounded-md border border-danger/40 bg-danger-soft p-3 text-sm text-danger" role="alert" data-view-sql-error>
        <p class="font-data whitespace-pre-wrap break-words">{{ adhocError }}</p>
      </div>
      <div v-else-if="adhoc" class="flex h-full min-h-0 flex-col" data-view-sql-result>
        <div class="min-h-0 flex-1">
          <ResultGrid
            :key="adhoc.queryId"
            :connection-id="connectionId"
            :schema="schema"
            :dialect="dialect"
            :sql="adhoc.sql"
            :columns="adhocColumns"
            :rows="adhoc.statement.rows"
          />
        </div>
        <p class="font-data flex items-center gap-3 px-1 pt-1 text-xs text-fg-muted">
          <span>{{ adhoc.statement.durationMs }} ms</span>
          <span>{{ t('query.rows', { count: adhoc.statement.rowCount }) }}</span>
          <span v-if="adhoc.statement.truncated" class="text-warning">{{ t('query.truncated', { count: queries.limit }) }}</span>
          <button type="button" class="ml-auto text-accent hover:underline" @click="resetSql">{{ t('grid.sqlBackToTable') }}</button>
        </p>
      </div>
      <UiEmptyState v-else-if="state.error.value" icon="lucide:triangle-alert" :title="t('grid.loadError')">
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
        :uniques="uniques"
        :pickable="pickableColumns"
        :widths="state.prefs.value.widths"
        :loading="state.loading.value"
        :editable="editable"
        :dialect="schemaStore.dialect"
        :selection-key="state.rows.value"
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
        @edit="applyEdit"
        @edit-foreign-key="editForeignKey"
        @delete-rows="requestDelete"
        @restore-rows="restoreRows"
        @duplicate-row="duplicateRow"
        @undo-row="undoRow"
      >
        <template #cell="{ column, row, value }">
          <span
            v-if="isFunctionValue(value)"
            class="font-data rounded-sm border border-border px-1 text-[11px] text-fg-subtle italic"
            data-function-badge
          >{{ (value as { $fn: string }).$fn }}()</span>
          <span
            v-else-if="isDefaultValue(value) || (metaOf(row)?.state === 'new' && value === undefined && columnHasDefault(column))"
            class="rounded-sm border border-border px-1 text-[10px] uppercase tracking-wide text-fg-subtle italic"
            data-default-badge
          >{{ t('edit.default') }}</span>
          <ForeignKeyCell
            v-else-if="parentByColumn.has(column)"
            :connection-id="connectionId"
            :schema="schema"
            :target="parentByColumn.get(column)!.target"
            :value="value"
            :virtual="parentByColumn.get(column)!.virtual"
            :parent="parentOf(parentByColumn.get(column)!, row)"
            :fallback-key="fallbackKeyOf(parentByColumn.get(column)!, value)"
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
      <HelpEmptyLink v-if="filtered" topic="noResults" class="ml-2" />
    </p>

    <PendingBar
      v-if="connection"
      :connection-id="connectionId"
      :schema="schema"
      :tab-id="tabId"
      :connection-name="connection.name"
      :environment="connection.environment"
    />

    <DeleteImpactDialog
      v-model:open="deleteOpen"
      :connection-id="connectionId"
      :schema="schema"
      :table="table.name"
      :keys="deleteKeys"
      @confirm="confirmDelete"
    />

    <UiDialog :open="!!confirmSql" :title="t('query.confirmTitle')" :description="t('query.confirmProd')" @update:open="(v) => !v && (confirmSql = null)">
      <pre class="font-data max-h-48 overflow-auto rounded-md border border-border bg-bg-subtle p-2 text-xs">{{ confirmSql?.sql }}</pre>
      <template #footer>
        <UiButton @click="confirmSql = null">{{ t('common.cancel') }}</UiButton>
        <UiButton variant="danger" @click="() => { const p = confirmSql; confirmSql = null; if (p) void runSql(p.sql, true) }">{{ t('query.runAnyway') }}</UiButton>
      </template>
    </UiDialog>

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

    <GridFooter
      v-if="!adhoc && !adhocError"
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
