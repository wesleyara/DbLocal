<script setup lang="ts">
import { useVirtualizer } from '@tanstack/vue-virtual'
import { tableFeatures, useTable } from '@tanstack/vue-table'
import type { ColumnKind, SchemaColumn } from '#shared/types/db'
import type { SortItem } from '#shared/types/rows'
import { functionsFor } from '#shared/edit-functions'
import { parseInput } from '#shared/edit-values'
import CellValue from './cells/CellValue.vue'
import CellEditor from './editors/CellEditor.vue'
import ValueDialog from './editors/ValueDialog.vue'
import JsonTree from './JsonTree.vue'
import { metaOf } from './row-meta'

const ROW_HEIGHT = 28
const HEADER_HEIGHT = 40
const GUTTER_WIDTH = 64
const MIN_WIDTH = 60
const MAX_WIDTH = 2000

/** Default column widths by kind: numbers and dates are short, JSON and identifiers need room. */
const WIDTH_BY_KIND: Partial<Record<ColumnKind, number>> = {
  number: 120,
  boolean: 90,
  date: 120,
  datetime: 180,
  time: 100,
  uuid: 280,
  json: 280,
}

const props = defineProps<{
  /** Columns in display order. The pinned ones must come first, as TableGrid arranges them. */
  columns: SchemaColumn[]
  /** Names of the pinned columns. They stay in view while the grid scrolls sideways. */
  pinned?: string[]
  rows: Record<string, unknown>[]
  sort: SortItem[]
  primaryKey: string[]
  foreignKeys: string[]
  /** Column lists of the table's unique indexes (primary key excluded), for the header markers. */
  uniques?: string[][]
  /** Saved widths in px by column name. Columns without one use the default for their kind. */
  widths?: Record<string, number>
  loading?: boolean
  /** Position of the first row in the whole result, so the row numbers continue across pages. */
  startIndex?: number
  /** Labels of the virtual relation columns (those named `@rel:...`), which are not sortable or filterable. */
  relationLabels?: Record<string, string>
  /** Cells can be edited (the table has a key and the connection is writable). */
  editable?: boolean
  /** FK columns edited through a picker instead of a text input. */
  pickable?: string[]
  /** Changes when a new page of data arrives: selection and any open editor are dropped then, not on every local edit. */
  selectionKey?: unknown
  /** Dialect of the connection: SQLite cannot reset an existing row's column to DEFAULT. */
  dialect?: string | null
}>()
const emit = defineEmits<{
  'update:sort': [sort: SortItem[]]
  'update:widths': [widths: Record<string, number>]
  filterByValue: [column: string, value: unknown]
  reorder: [from: string, to: string]
  togglePin: [column: string]
  download: [column: string, row: Record<string, unknown>]
  hide: [column: string]
  /** Rows currently in view, as indexes into `rows`, so related data is loaded for them only. */
  visible: [first: number, last: number]
  /** The user asked for the full record of a row (gutter click or Space). */
  openRow: [row: Record<string, unknown>]
  /** A cell was edited. `value` may be `{ $default: true }` (reset to the column default). */
  edit: [row: Record<string, unknown>, column: string, value: unknown]
  /** A foreign key cell is to be edited: the parent applies the picker. */
  editForeignKey: [row: Record<string, unknown>, column: string]
  deleteRows: [rows: Record<string, unknown>[]]
  restoreRows: [rows: Record<string, unknown>[]]
  duplicateRow: [row: Record<string, unknown>]
  undoRow: [row: Record<string, unknown>]
}>()
const { t } = useI18n()

const kindByName = computed(() => new Map(props.columns.map((c) => [c.name, c.kind])))
const pinnedSet = computed(() => new Set(props.pinned ?? []))
/** How many leading columns are pinned. TableGrid puts them first, so they are always a prefix. */
const pinnedCount = computed(() => props.columns.filter((c) => pinnedSet.value.has(c.name)).length)

// While a resize is dragged the live width wins; on release the widths are saved.
const liveWidths = ref<Record<string, number>>({})
const widthOf = (name: string | undefined): number => {
  if (!name) return 200
  return liveWidths.value[name] ?? props.widths?.[name] ?? WIDTH_BY_KIND[kindByName.value.get(name) ?? 'other'] ?? 200
}

// TanStack Table owns the column and row models; the grid only decides what is drawn.
// Column ids are the raw names and values come from accessorFn, so dots in names are not paths.
const features = tableFeatures({})
const table = useTable({
  features,
  columns: computed(() =>
    props.columns.map((col) => ({
      id: col.name,
      header: col.name,
      accessorFn: (row: Record<string, unknown>) => row[col.name],
    })),
  ),
  data: computed(() => props.rows),
})
const leafColumns = computed(() => table.getAllLeafColumns())
const modelRows = computed(() => table.getRowModel().rows)

const scrollEl = ref<HTMLElement | null>(null)
/** Horizontal scroll, so pinned columns can follow it without being virtualised. */
const scrollX = ref(0)
const onScroll = () => {
  if (scrollEl.value) scrollX.value = scrollEl.value.scrollLeft
}

// Rows and columns are both virtualised: only what is on screen is in the DOM. Pinned columns are
// still part of the geometry (they sit first) but are drawn separately, so the virtualiser skips them.
const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: modelRows.value.length,
    getScrollElement: () => scrollEl.value,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })),
)
const colVirtualizer = useVirtualizer(
  computed(() => ({
    horizontal: true,
    count: leafColumns.value.length,
    getScrollElement: () => scrollEl.value,
    estimateSize: (index: number) => widthOf(leafColumns.value[index]?.id),
    overscan: 3,
  })),
)

// Sizes are read by the virtualizer through a plain function, so it has to be told when they change.
watch([liveWidths, () => props.widths, leafColumns], () => colVirtualizer.value.measure(), { deep: true })

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())

const isRelationColumn = (name: string | undefined) => !!name && name.startsWith('@rel:')
const labelOf = (name: string) => props.relationLabels?.[name] ?? name

watch(
  [virtualRows, () => props.rows],
  () => {
    const items = virtualRows.value
    if (items.length > 0) emit('visible', items[0]!.index, items[items.length - 1]!.index)
  },
  { flush: 'post' },
)
const virtualCols = computed(() => colVirtualizer.value.getVirtualItems().filter((vc) => vc.index >= pinnedCount.value))
const totalWidth = computed(() => GUTTER_WIDTH + colVirtualizer.value.getTotalSize())
const totalHeight = computed(() => HEADER_HEIGHT + rowVirtualizer.value.getTotalSize())

/** Pinned columns: left edge is the gutter plus the widths before them, moved by the horizontal scroll. */
const pinnedCols = computed(() => {
  let left = GUTTER_WIDTH
  return leafColumns.value.slice(0, pinnedCount.value).map((col, index) => {
    const item = { index, id: col.id, left, width: widthOf(col.id) }
    left += item.width
    return item
  })
})
const pinnedLeft = (left: number) => `${left + scrollX.value}px`

// Selection is a rectangle: `anchor` is where it started, `cursor` is the moving corner.
const anchor = ref<{ row: number; col: number } | null>(null)
const cursor = ref<{ row: number; col: number } | null>(null)
watch(
  () => props.selectionKey,
  () => {
    anchor.value = null
    cursor.value = null
  },
)

const range = computed(() => {
  if (!anchor.value || !cursor.value) return null
  return {
    r0: Math.min(anchor.value.row, cursor.value.row),
    r1: Math.max(anchor.value.row, cursor.value.row),
    c0: Math.min(anchor.value.col, cursor.value.col),
    c1: Math.max(anchor.value.col, cursor.value.col),
  }
})
const inRange = (row: number, col: number) => {
  const r = range.value
  return !!r && row >= r.r0 && row <= r.r1 && col >= r.c0 && col <= r.c1
}

// ---- editing ---------------------------------------------------------------------------------

const editing = ref<{ row: number; col: number } | null>(null)
const editorDialog = ref<{ open: boolean; column: SchemaColumn | null; value: unknown; row: Record<string, unknown> | null }>({
  open: false,
  column: null,
  value: null,
  row: null,
})
watch(
  () => props.selectionKey,
  () => (editing.value = null),
)

const columnAt = (col: number): SchemaColumn | null => props.columns[col] ?? null
const rowAt = (row: number): Record<string, unknown> | null =>
  (modelRows.value[row]?.original as Record<string, unknown> | undefined) ?? null

/** A cell can be typed into when the grid is editable, the row is not deleted and the column is a real, non-generated one. */
function canEditCell(row: number, col: number): boolean {
  const column = columnAt(col)
  const data = rowAt(row)
  if (!props.editable || !column || !data || isRelationColumn(column.name)) return false
  if (metaOf(data)?.state === 'deleted') return false
  return !column.isGenerated
}

const isEditing = (row: number, col: number) => editing.value?.row === row && editing.value?.col === col

function focusGrid(): void {
  void nextTick(() => scrollEl.value?.focus({ preventScroll: true }))
}

/** Starts editing the cell with the editor that fits its column; FKs open the picker. */
function startEdit(row: number, col: number): void {
  const column = columnAt(col)
  const data = rowAt(row)
  if (!column || !data || !canEditCell(row, col)) return
  const value = valueAt(row, col)
  if (props.pickable?.includes(column.name)) {
    emit('editForeignKey', data, column.name)
    return
  }
  if (column.kind === 'binary') return
  if (column.kind === 'json' || column.kind === 'array') {
    editorDialog.value = { open: true, column, value, row: data }
    return
  }
  editing.value = { row, col }
}

function onEditorCommit(value: unknown, move: 'down' | 'right' | 'none'): void {
  const at = editing.value
  editing.value = null
  if (!at) return
  const column = columnAt(at.col)
  const data = rowAt(at.row)
  if (column && data) emit('edit', data, column.name, value)
  if (move === 'down') moveTo(at.row + 1, at.col, false)
  else if (move === 'right') moveTo(at.row, at.col + 1, false)
  focusGrid()
}

function onEditorCancel(): void {
  editing.value = null
  focusGrid()
}

function onEditorDialogCommit(value: unknown): void {
  const { column, row } = editorDialog.value
  if (column && row) emit('edit', row, column.name, value)
}

function setCellValue(row: number, col: number, value: unknown): void {
  const column = columnAt(col)
  const data = rowAt(row)
  if (column && data && canEditCell(row, col)) emit('edit', data, column.name, value)
}

// ---- row checkboxes (gutter) -----------------------------------------------------------------

/** Rows ticked in the gutter, by primary key. Dropped with the cell selection when a new page arrives. */
const checked = ref<Set<string>>(new Set())
watch(
  () => props.selectionKey,
  () => (checked.value = new Set()),
)

function rowKey(row: Record<string, unknown> | undefined): string | null {
  if (!row || !props.primaryKey.length) return null
  const state = metaOf(row)?.state
  if (state === 'new' || state === 'deleted') return null
  return JSON.stringify(props.primaryKey.map((k) => row[k] ?? null))
}

/** Rows that can be ticked: loaded, not new and not already marked for deletion. */
const checkableRows = computed(() =>
  props.rows.filter((r) => rowKey(r) !== null),
)
const checkedRows = computed(() => checkableRows.value.filter((r) => checked.value.has(rowKey(r)!)))
const allChecked = computed<boolean | 'indeterminate'>(() =>
  checkedRows.value.length === 0 ? false : checkedRows.value.length === checkableRows.value.length ? true : 'indeterminate',
)

function toggleChecked(row: Record<string, unknown> | undefined, on: boolean): void {
  const key = rowKey(row)
  if (!key) return
  const next = new Set(checked.value)
  if (on) next.add(key)
  else next.delete(key)
  checked.value = next
}

const boxClass = (on: boolean): string =>
  `flex size-3.5 items-center justify-center rounded-sm border outline-none focus-visible:ring-1 focus-visible:ring-accent ${
    on ? 'border-accent bg-accent' : 'border-border-strong bg-bg-subtle hover:border-accent'
  }`

function toggleAll(on: boolean): void {
  checked.value = on ? new Set(checkableRows.value.map((r) => rowKey(r)!)) : new Set()
}

function deleteChecked(): void {
  const rows = checkedRows.value
  checked.value = new Set()
  if (rows.length) emit('deleteRows', rows)
}

function selectedRows(): Record<string, unknown>[] {
  const r = range.value
  if (!r) return []
  const out: Record<string, unknown>[] = []
  for (let row = r.r0; row <= r.r1; row++) {
    const data = rowAt(row)
    if (data) out.push(data)
  }
  return out
}

function onCellDblClick(row: number, col: number): void {
  if (canEditCell(row, col)) startEdit(row, col)
  else openValue(row, col)
}

const cellTitle = (row: unknown, column: string): string | undefined => {
  const changed = metaOf(row)?.changed[column]
  if (!changed) return undefined
  const was = changed.original === null || changed.original === undefined ? 'NULL' : String(changed.original)
  return t('edit.was', { value: was.length > 200 ? `${was.slice(0, 200)}…` : was })
}

function rowClass(row: unknown): string {
  const meta = metaOf(row)
  if (!meta) return ''
  if (meta.error) return 'bg-danger-soft ring-1 ring-inset ring-danger'
  if (meta.state === 'new') return 'bg-success-soft'
  if (meta.state === 'deleted') return 'bg-danger-soft text-fg-muted line-through'
  return ''
}

/** New rows sit above the loaded ones: they show `+`, and the numbers of the loaded rows are unaffected. */
const newRowCount = computed(() => props.rows.filter((r) => metaOf(r)?.state === 'new').length)
function gutterLabel(index: number): string {
  if (metaOf(modelRows.value[index]?.original)?.state === 'new') return '+'
  return String((props.startIndex ?? 0) + index - newRowCount.value + 1)
}

const cellChanged = (row: unknown, column: string): boolean => !!metaOf(row)?.changed[column]

// ---- resize ----------------------------------------------------------------------------------

function startResize(event: PointerEvent, name: string): void {
  event.stopPropagation()
  event.preventDefault()
  const startX = event.clientX
  const startWidth = widthOf(name)
  const onMove = (e: PointerEvent) => {
    liveWidths.value = {
      ...liveWidths.value,
      [name]: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + e.clientX - startX)),
    }
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    const final = liveWidths.value[name]
    if (final !== undefined) emit('update:widths', { ...props.widths, [name]: final })
    liveWidths.value = {}
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

// ---- reorder (drag a header onto another) ----------------------------------------------------

const dragging = ref<string | null>(null)

function dropOn(target: string): void {
  if (dragging.value && dragging.value !== target) emit('reorder', dragging.value, target)
  dragging.value = null
}

// ---- sort ------------------------------------------------------------------------------------

function toggleSort(event: MouseEvent, column: string): void {
  if (isRelationColumn(column)) return
  const index = props.sort.findIndex((s) => s.column === column)
  const current = props.sort[index]
  let next: SortItem[]
  if (event.shiftKey) {
    // Shift adds or flips this column without dropping the others: asc, then desc, then removed.
    if (!current) next = [...props.sort, { column, direction: 'asc' }]
    else if (current.direction === 'asc') next = props.sort.map((s, i) => (i === index ? { ...s, direction: 'desc' } : s))
    else next = props.sort.filter((_, i) => i !== index)
  } else {
    next = !current ? [{ column, direction: 'asc' }] : current.direction === 'asc' ? [{ column, direction: 'desc' }] : []
  }
  emit('update:sort', next)
}

function sortIndicator(name: string): 'asc' | 'desc' | null {
  return props.sort.find((s) => s.column === name)?.direction ?? null
}

// ---- selection, copy ------------------------------------------------------------------------

function select(row: number, col: number, extend: boolean): void {
  if (extend && anchor.value) cursor.value = { row, col }
  else {
    anchor.value = { row, col }
    cursor.value = { row, col }
  }
}

function moveTo(row: number, col: number, extend: boolean): void {
  const r = Math.min(Math.max(row, 0), modelRows.value.length - 1)
  const c = Math.min(Math.max(col, 0), leafColumns.value.length - 1)
  select(r, c, extend)
  rowVirtualizer.value.scrollToIndex(r)
  colVirtualizer.value.scrollToIndex(c)
}

function valueAt(row: number, col: number): unknown {
  return modelRows.value[row]?.getAllCells()[col]?.getValue()
}

function textOf(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/** The selected rectangle as TSV: rows on lines, columns separated by tabs. */
function selectionAsTsv(): string {
  const r = range.value
  if (!r) return ''
  const lines: string[] = []
  for (let row = r.r0; row <= r.r1; row++) {
    const cells: string[] = []
    for (let col = r.c0; col <= r.c1; col++) cells.push(textOf(valueAt(row, col)).replace(/[\t\n]/g, ' '))
    lines.push(cells.join('\t'))
  }
  return lines.join('\n')
}

function copyText(text: string): void {
  void navigator.clipboard?.writeText(text)
}

/** Arrow keys move the cursor (Shift extends the selection), ⌘C / Ctrl+C copies it as TSV. */
function onKeydown(event: KeyboardEvent): void {
  if (modelRows.value.length === 0 || leafColumns.value.length === 0) return
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && range.value) {
    copyText(selectionAsTsv())
    return
  }
  const { row, col } = cursor.value ?? { row: 0, col: 0 }
  const moves: Record<string, [number, number]> = {
    ArrowDown: [row + 1, col],
    ArrowUp: [row - 1, col],
    ArrowRight: [row, col + 1],
    ArrowLeft: [row, col - 1],
  }
  if (props.editable && cursor.value && (event.key === 'Enter' || event.key === 'F2')) {
    event.preventDefault()
    startEdit(cursor.value.row, cursor.value.col)
    return
  }
  if (props.editable && (event.key === 'Delete' || event.key === 'Backspace') && range.value) {
    event.preventDefault()
    const rows = selectedRows()
    if (rows.length) emit('deleteRows', rows)
    return
  }
  if (event.key === ' ' && cursor.value) {
    event.preventDefault()
    const original = modelRows.value[cursor.value.row]?.original as Record<string, unknown> | undefined
    if (original) emit('openRow', original)
    return
  }
  // ⌘Z undoes the pending edits of the row under the cursor (one level: the whole row).
  if (props.editable && (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && cursor.value) {
    const original = modelRows.value[cursor.value.row]?.original as Record<string, unknown> | undefined
    const meta = original ? metaOf(original) : null
    if (original && meta && (meta.state || Object.keys(meta.changed).length)) {
      event.preventDefault()
      emit('undoRow', original)
    }
    return
  }
  // F filters the table by the value of the cell under the cursor.
  if (event.key.toLowerCase() === 'f' && !event.metaKey && !event.ctrlKey && !event.altKey && cursor.value) {
    const name = leafColumns.value[cursor.value.col]?.id ?? ''
    if (filterableName(name, kindByName.value.get(name))) {
      event.preventDefault()
      emit('filterByValue', name, valueAt(cursor.value.row, cursor.value.col))
    }
    return
  }
  // Home / End jump to the first / last column of the row, with ⌘ / Ctrl to the first / last row.
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    const first = event.key === 'Home'
    const mod = event.metaKey || event.ctrlKey
    moveTo(mod ? (first ? 0 : Infinity) : row, first ? 0 : Infinity, event.shiftKey)
    return
  }
  if (event.key === 'PageDown' || event.key === 'PageUp') {
    event.preventDefault()
    const page = Math.max(1, (virtualRows.value.length || 10) - 2)
    moveTo(event.key === 'PageDown' ? row + page : row - page, col, event.shiftKey)
    return
  }
  const target = moves[event.key]
  if (target) {
    event.preventDefault()
    moveTo(target[0], target[1], event.shiftKey)
  }
}

// ---- context menu: one menu for the whole grid, the target is read from the event -----------------

type MenuTarget = { type: 'cell'; row: number; col: number } | { type: 'header'; name: string }
const menuTarget = ref<MenuTarget | null>(null)

function onContextMenu(event: MouseEvent): void {
  const el = event.target instanceof Element ? event.target : null
  const cell = el?.closest<HTMLElement>('[data-r]')
  const head = el?.closest<HTMLElement>('[data-h]')
  if (cell) {
    const row = Number(cell.dataset.r)
    const col = Number(cell.dataset.c)
    if (!inRange(row, col)) select(row, col, false)
    menuTarget.value = { type: 'cell', row, col }
  } else if (head?.dataset.h) {
    menuTarget.value = { type: 'header', name: head.dataset.h }
  } else {
    menuTarget.value = null
  }
}

/** Filtering by a value only makes sense for scalars; the same rule the dialog uses. */
const filterable = (kind: ColumnKind | undefined) => !!kind && kind !== 'binary' && kind !== 'json' && kind !== 'array'
const filterableName = (name: string, kind: ColumnKind | undefined) => !isRelationColumn(name) && filterable(kind)

const menuItems = computed(() => {
  const target = menuTarget.value
  if (!target) return []
  if (target.type === 'cell') {
    const name = leafColumns.value[target.col]?.id ?? ''
    const kind = kindByName.value.get(name)
    const value = valueAt(target.row, target.col)
    const items = [{ label: t('grid.copyValue'), icon: 'lucide:copy', onSelect: () => copyText(textOf(value)) }]
    if (kind === 'uuid' && value !== null && value !== undefined) {
      items.push({ label: t('grid.copyUuid'), icon: 'lucide:fingerprint', onSelect: () => copyText(String(value)) })
    }
    if (filterableName(name, kind)) {
      items.push({ label: t('grid.filterByThisValue'), icon: 'lucide:filter', onSelect: () => emit('filterByValue', name, value) })
    }
    const original = modelRows.value[target.row]?.original as Record<string, unknown> | undefined
    if (original) items.push({ label: t('record.open'), icon: 'lucide:panel-right-open', onSelect: () => emit('openRow', original) })
    const column = columnAt(target.col)
    if (props.editable && original && column && !isRelationColumn(column.name)) {
      const meta = metaOf(original)
      const deleted = meta?.state === 'deleted'
      const edits: typeof items = []
      if (canEditCell(target.row, target.col)) {
        if (column.kind !== 'binary') {
          edits.push({ label: t('edit.editValue'), icon: 'lucide:pencil', onSelect: () => startEdit(target.row, target.col) })
        }
        if (column.nullable) {
          edits.push({ label: t('edit.setNull'), icon: 'lucide:circle-slash', onSelect: () => setCellValue(target.row, target.col, null) })
        }
        for (const fn of functionsFor(column)) {
          const parsed = parseInput(column, `${fn}()`)
          if (!parsed.ok) continue
          edits.push({
            label: t('edit.generate', { fn: `${fn}()` }),
            icon: 'lucide:wand-sparkles',
            onSelect: () => setCellValue(target.row, target.col, parsed.value),
          })
        }
        const defaultable = column.default !== null || column.nullable
        if (defaultable && (props.dialect !== 'sqlite' || meta?.state === 'new')) {
          edits.push({
            label: t('edit.setDefault'),
            icon: 'lucide:rotate-ccw',
            onSelect: () => setCellValue(target.row, target.col, { $default: true }),
          })
        }
      }
      const wasChanged = meta?.changed[column.name]
      if (wasChanged) {
        edits.push({
          label: t('edit.undoCell'),
          icon: 'lucide:undo-2',
          onSelect: () => emit('edit', original, column.name, wasChanged.original),
        })
      }
      if (meta && (meta.state || Object.keys(meta.changed).length)) {
        edits.push({ label: t('edit.undoRow'), icon: 'lucide:undo-2', onSelect: () => emit('undoRow', original) })
      }
      if (meta?.state !== 'new') {
        edits.push({ label: t('edit.duplicateRow'), icon: 'lucide:copy-plus', onSelect: () => emit('duplicateRow', original) })
      }
      edits.push(
        deleted
          ? { label: t('edit.restoreRow'), icon: 'lucide:archive-restore', onSelect: () => emit('restoreRows', selectedRows()) }
          : { label: t('edit.deleteRow'), icon: 'lucide:trash-2', onSelect: () => emit('deleteRows', selectedRows().length ? selectedRows() : [original]) },
      )
      items.push(...edits)
    }
    return items
  }
  const name = target.name
  if (isRelationColumn(name)) {
    return [
      { label: t('grid.copyName'), icon: 'lucide:copy', onSelect: () => copyText(labelOf(name)) },
      { label: t('grid.hideColumn'), icon: 'lucide:eye-off', onSelect: () => emit('hide', name) },
    ]
  }
  const items = [
    { label: t('grid.copyName'), icon: 'lucide:copy', onSelect: () => copyText(name) },
    { label: t('grid.sortAscendingAction'), icon: 'lucide:arrow-up', onSelect: () => emit('update:sort', [{ column: name, direction: 'asc' }]) },
    { label: t('grid.sortDescendingAction'), icon: 'lucide:arrow-down', onSelect: () => emit('update:sort', [{ column: name, direction: 'desc' }]) },
    { label: pinnedSet.value.has(name) ? t('grid.unpin') : t('grid.pin'), icon: 'lucide:pin', onSelect: () => emit('togglePin', name) },
    { label: t('grid.hideColumn'), icon: 'lucide:eye-off', onSelect: () => emit('hide', name) },
  ]
  // Filter by the value of the selected cell, when that cell is in this column.
  const col = leafColumns.value.findIndex((c) => c.id === name)
  if (cursor.value && cursor.value.col === col && filterableName(name, kindByName.value.get(name))) {
    const value = valueAt(cursor.value.row, col)
    items.push({ label: t('grid.filterByThisValue'), icon: 'lucide:filter', onSelect: () => emit('filterByValue', name, value) })
  }
  return items
})

// ---- value dialog ---------------------------------------------------------------------------

const dialogOpen = ref(false)
const dialogColumn = ref<SchemaColumn | null>(null)
const dialogValue = ref<unknown>(null)
const dialogRow = ref<Record<string, unknown> | null>(null)

const isTree = computed(() => {
  const k = dialogColumn.value?.kind
  return (k === 'json' || k === 'array') && typeof dialogValue.value === 'object' && dialogValue.value !== null
})
/** Plain text for everything that is not a tree: NULL, scalars, and binaries as their size. */
const dialogText = computed(() => {
  const v = dialogValue.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  return String(v)
})
const dialogCanFilter = computed(() => {
  const kind = dialogColumn.value?.kind
  return !!kind && kind !== 'binary' && kind !== 'json' && kind !== 'array' && dialogValue.value !== null
})
const dialogCanDownload = computed(
  () => dialogColumn.value?.kind === 'binary' && props.primaryKey.length > 0 && dialogValue.value !== null,
)

function openValue(row: number, col: number): void {
  const name = leafColumns.value[col]?.id
  dialogColumn.value = props.columns.find((c) => c.name === name) ?? null
  dialogValue.value = valueAt(row, col)
  dialogRow.value = (modelRows.value[row]?.original ?? null) as Record<string, unknown> | null
  dialogOpen.value = true
}

function filterByDialogValue(): void {
  if (dialogColumn.value) emit('filterByValue', dialogColumn.value.name, dialogValue.value)
  dialogOpen.value = false
}

function downloadDialogValue(): void {
  if (dialogColumn.value && dialogRow.value) emit('download', dialogColumn.value.name, dialogRow.value)
}
</script>

<template>
  <UiContextMenu :items="menuItems">
  <div
    ref="scrollEl"
    role="grid"
    tabindex="0"
    :aria-rowcount="rows.length"
    class="font-data relative h-full select-none min-h-0 overflow-auto rounded-md border border-border bg-bg text-xs text-fg outline-none focus-visible:ring-1 focus-visible:ring-accent"
    @keydown="onKeydown"
    @scroll="onScroll"
    @contextmenu="onContextMenu"
  >
    <div :style="{ width: `${totalWidth}px`, height: `${totalHeight}px`, position: 'relative' }">
      <!-- Header: sticky to the top; its gutter stays on the left while the columns scroll. -->
      <div
        role="row"
        class="sticky top-0 z-20 border-b border-border bg-bg-subtle"
        :style="{ height: `${HEADER_HEIGHT}px`, width: `${totalWidth}px` }"
      >
        <div
          class="group sticky left-0 z-30 flex h-full items-center justify-center bg-bg-subtle text-[10px] text-fg-subtle"
          :style="{ width: `${GUTTER_WIDTH}px` }"
        >
          <button
            v-if="editable && checkableRows.length"
            type="button"
            role="checkbox"
            :aria-checked="allChecked === 'indeterminate' ? 'mixed' : allChecked"
            :aria-label="t('grid.selectAll')"
            class="flex size-full items-center justify-center outline-none"
            data-select-all
            @click.stop="toggleAll(allChecked !== true)"
          >
            <span v-if="allChecked === false" class="group-hover:hidden">#</span>
            <span :class="[boxClass(allChecked !== false), allChecked === false && 'hidden group-hover:flex']">
              <Icon v-if="allChecked !== false" :name="allChecked === 'indeterminate' ? 'lucide:minus' : 'lucide:check'" class="size-3 text-accent-fg" />
            </span>
          </button>
          <span v-else>#</span>
        </div>

        <!-- Pinned headers follow the scroll. They are drawn after the others so they sit on top. -->
        <div
          v-for="pc in pinnedCols"
          :key="`pinned-${pc.id}`"
          class="absolute top-0 z-20 h-full bg-bg-subtle"
          :style="{ left: pinnedLeft(pc.left), width: `${pc.width}px` }"
          :data-pinned="pc.id"
          :data-h="pc.id"
        >
          <button
            type="button"
            class="absolute right-1 top-1 z-30 flex size-4 items-center justify-center rounded-sm text-accent hover:text-fg"
            :aria-label="t('grid.unpin')"
            :title="t('grid.unpin')"
            @click.stop="emit('togglePin', pc.id)"
          >
            <Icon name="lucide:pin-off" class="size-3" />
          </button>
          <button
            type="button"
            role="columnheader"
            draggable="true"
            class="flex h-full w-full min-w-0 items-center gap-1 border-r border-border px-2 text-left hover:bg-surface-hover"
            :aria-sort="sortIndicator(pc.id) === 'asc' ? 'ascending' : sortIndicator(pc.id) === 'desc' ? 'descending' : 'none'"
            @dragstart="dragging = pc.id"
            @dragover.prevent
            @drop.prevent="dropOn(pc.id)"
            @click="toggleSort($event, pc.id)"
          >
            <span class="flex min-w-0 flex-col leading-tight">
              <span class="flex items-center gap-1 truncate text-fg">
                <Icon name="lucide:pin" class="size-3 shrink-0 text-accent" />
                <Icon v-if="primaryKey.includes(pc.id)" name="lucide:key-round" class="size-3 shrink-0 text-warning" :aria-label="t('grid.primaryKey')" />
                <span class="truncate">{{ labelOf(pc.id) }}</span>
                <GridColumnMarks :column="columns.find((c) => c.name === pc.id)" :primary-key="primaryKey.includes(pc.id)" :uniques="uniques ?? []" />
              </span>
              <span class="truncate text-[10px] text-fg-subtle">{{ columns.find((c) => c.name === pc.id)?.nativeType }}</span>
            </span>
          </button>
        </div>

        <div
          v-for="vc in virtualCols"
          :key="String(vc.key)"
          class="group absolute top-0 h-full"
          :data-h="leafColumns[vc.index]!.id"
          :style="{ left: `${GUTTER_WIDTH + vc.start}px`, width: `${vc.size}px` }"
        >
          <button
            type="button"
            role="columnheader"
            draggable="true"
            class="flex h-full w-full min-w-0 items-center gap-1 border-r border-border px-2 text-left hover:bg-surface-hover"
            :aria-sort="sortIndicator(leafColumns[vc.index]!.id) === 'asc' ? 'ascending' : sortIndicator(leafColumns[vc.index]!.id) === 'desc' ? 'descending' : 'none'"
            @dragstart="dragging = leafColumns[vc.index]!.id"
            @dragover.prevent
            @drop.prevent="dropOn(leafColumns[vc.index]!.id)"
            @click="toggleSort($event, leafColumns[vc.index]!.id)"
          >
            <span class="flex min-w-0 flex-col leading-tight">
              <span class="flex items-center gap-1 truncate text-fg">
                <Icon v-if="primaryKey.includes(leafColumns[vc.index]!.id)" name="lucide:key-round" class="size-3 shrink-0 text-warning" :aria-label="t('grid.primaryKey')" />
                <Icon v-else-if="foreignKeys.includes(leafColumns[vc.index]!.id)" name="lucide:link" class="size-3 shrink-0 text-accent" :aria-label="t('grid.foreignKey')" />
                <Icon v-else-if="isRelationColumn(leafColumns[vc.index]!.id)" name="lucide:git-fork" class="size-3 shrink-0 text-accent" />
                <span class="truncate">{{ labelOf(leafColumns[vc.index]!.id) }}</span>
                <GridColumnMarks
                  :column="columns.find((c) => c.name === leafColumns[vc.index]!.id)"
                  :primary-key="primaryKey.includes(leafColumns[vc.index]!.id)"
                  :uniques="uniques ?? []"
                />
              </span>
              <span class="truncate text-[10px] text-fg-subtle">{{ columns.find((c) => c.name === leafColumns[vc.index]!.id)?.nativeType }}</span>
            </span>
            <Icon
              v-if="sortIndicator(leafColumns[vc.index]!.id)"
              :name="sortIndicator(leafColumns[vc.index]!.id) === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'"
              class="ml-auto size-3 shrink-0 text-accent"
              :aria-label="sortIndicator(leafColumns[vc.index]!.id) === 'asc' ? t('grid.sortAscending') : t('grid.sortDescending')"
            />
          </button>
          <!-- Pin toggle and the drag handle on the right edge (resizes the column, saved on release). -->
          <button
            type="button"
            class="absolute right-2 top-1 hidden size-4 items-center justify-center rounded-sm text-fg-subtle hover:text-accent group-hover:flex"
            :aria-label="t('grid.pin')"
            :title="t('grid.pin')"
            @click.stop="emit('togglePin', leafColumns[vc.index]!.id)"
          >
            <Icon name="lucide:pin" class="size-3" />
          </button>
          <span
            role="separator"
            aria-orientation="vertical"
            class="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-accent/40"
            @pointerdown="startResize($event, leafColumns[vc.index]!.id)"
            @click.stop
          />
        </div>
      </div>

      <!-- Skeleton rows while the first page is on its way. -->
      <div
        v-if="loading && rows.length === 0"
        class="absolute left-0 space-y-2 p-2"
        :style="{ top: `${HEADER_HEIGHT}px`, width: `max(100%, ${totalWidth}px)` }"
        data-grid-skeleton
      >
        <UiSkeleton v-for="i in 8" :key="i" class="h-4" />
      </div>

      <!-- Body: each row is placed at its virtual offset; cells at their column offsets. -->
      <div
        v-for="vr in virtualRows"
        :key="String(vr.key)"
        role="row"
        class="absolute left-0 flex border-b border-border/60 hover:bg-surface/60"
        :class="rowClass(modelRows[vr.index]?.original)"
        :data-row-state="metaOf(modelRows[vr.index]?.original)?.state ?? undefined"
        :data-row-error="metaOf(modelRows[vr.index]?.original)?.error ? 'true' : undefined"
        :title="metaOf(modelRows[vr.index]?.original)?.error"
        :style="{ top: `${HEADER_HEIGHT + vr.start}px`, height: `${ROW_HEIGHT}px`, width: `${totalWidth}px` }"
      >
        <div
          class="group sticky left-0 z-10 flex h-full items-center justify-center bg-bg text-xs text-fg-subtle tabular-nums"
          :style="{ width: `${GUTTER_WIDTH}px` }"
        >
          <button
            v-if="editable && rowKey(modelRows[vr.index]?.original as Record<string, unknown>)"
            type="button"
            role="checkbox"
            :aria-checked="checked.has(rowKey(modelRows[vr.index]?.original as Record<string, unknown>)!)"
            :aria-label="t('grid.selectRow')"
            class="flex size-full items-center justify-center outline-none"
            data-row-check
            @click.stop="toggleChecked(modelRows[vr.index]?.original as Record<string, unknown>, !checked.has(rowKey(modelRows[vr.index]?.original as Record<string, unknown>)!))"
          >
            <span
              v-if="!checked.has(rowKey(modelRows[vr.index]?.original as Record<string, unknown>)!)"
              class="leading-none group-hover:hidden"
            >{{ gutterLabel(vr.index) }}</span>
            <span :class="[boxClass(checked.has(rowKey(modelRows[vr.index]?.original as Record<string, unknown>)!)), !checked.has(rowKey(modelRows[vr.index]?.original as Record<string, unknown>)!) && 'hidden group-hover:flex']">
              <Icon v-if="checked.has(rowKey(modelRows[vr.index]?.original as Record<string, unknown>)!)" name="lucide:check" class="size-3 text-accent-fg" />
            </span>
          </button>
          <span
            v-else
            class="leading-none"
            data-row-gutter
          >{{ gutterLabel(vr.index) }}</span>
        </div>
        <div
          v-for="pc in pinnedCols"
          :key="`pinned-${pc.id}`"
          role="gridcell"
          class="absolute top-0 z-10 flex h-full min-w-0 items-center overflow-hidden border-r border-border bg-bg px-2"
          :class="[inRange(vr.index, pc.index) && 'bg-accent-soft', cellChanged(modelRows[vr.index]?.original, pc.id) && 'border-l-2 border-l-warning bg-warning-soft']"
          :data-r="vr.index"
          :data-c="pc.index"
          :title="cellTitle(modelRows[vr.index]?.original, pc.id)"
          :style="{ left: pinnedLeft(pc.left), width: `${pc.width}px` }"
          @mousedown="select(vr.index, pc.index, $event.shiftKey)"
          @dblclick="onCellDblClick(vr.index, pc.index)"
        >
          <CellEditor
            v-if="isEditing(vr.index, pc.index)"
            :column="columnAt(pc.index)!"
            :value="modelRows[vr.index]!.getAllCells()[pc.index]?.getValue()"
            @commit="onEditorCommit"
            @cancel="onEditorCancel"
          />
          <slot
            v-else-if="modelRows[vr.index]"
            name="cell"
            :column="pc.id"
            :row="modelRows[vr.index]!.original"
            :value="modelRows[vr.index]!.getAllCells()[pc.index]?.getValue()"
          >
            <CellValue
              :value="modelRows[vr.index]!.getAllCells()[pc.index]?.getValue()"
              :kind="kindByName.get(pc.id) ?? 'other'"
            />
          </slot>
        </div>
        <div
          v-for="vc in virtualCols"
          :key="String(vc.key)"
          role="gridcell"
          class="absolute top-0 flex h-full min-w-0 items-center overflow-hidden border-r border-border/40 px-2"
          :class="[inRange(vr.index, vc.index) && 'bg-accent-soft', cellChanged(modelRows[vr.index]?.original, leafColumns[vc.index]!.id) && 'border-l-2 border-l-warning bg-warning-soft']"
          :data-r="vr.index"
          :data-c="vc.index"
          :title="cellTitle(modelRows[vr.index]?.original, leafColumns[vc.index]!.id)"
          :style="{ left: `${GUTTER_WIDTH + vc.start}px`, width: `${vc.size}px` }"
          @mousedown="select(vr.index, vc.index, $event.shiftKey)"
          @dblclick="onCellDblClick(vr.index, vc.index)"
        >
          <CellEditor
            v-if="isEditing(vr.index, vc.index)"
            :column="columnAt(vc.index)!"
            :value="modelRows[vr.index]!.getAllCells()[vc.index]?.getValue()"
            @commit="onEditorCommit"
            @cancel="onEditorCancel"
          />
          <slot
            v-else-if="modelRows[vr.index]"
            name="cell"
            :column="leafColumns[vc.index]!.id"
            :row="modelRows[vr.index]!.original"
            :value="modelRows[vr.index]!.getAllCells()[vc.index]?.getValue()"
          >
            <CellValue
              :value="modelRows[vr.index]!.getAllCells()[vc.index]?.getValue()"
              :kind="kindByName.get(leafColumns[vc.index]!.id) ?? 'other'"
            />
          </slot>
        </div>
      </div>
    </div>

    <div
      v-if="checkedRows.length"
      class="sticky bottom-2 left-2 z-40 flex w-fit items-center gap-2 rounded-md border border-border bg-surface px-2 py-1 shadow-md"
      data-check-bar
    >
      <span class="text-fg-muted">{{ t('grid.checked', { count: checkedRows.length }) }}</span>
      <UiButton size="sm" variant="danger" data-check-delete @click="deleteChecked">{{ t('edit.deleteRows') }}</UiButton>
      <UiButton size="sm" variant="secondary" @click="toggleAll(false)">{{ t('grid.clearChecked') }}</UiButton>
    </div>

    <div v-if="loading" class="pointer-events-none absolute right-2 top-2 z-30 flex items-center gap-1 rounded-sm bg-surface px-1.5 py-0.5 text-fg-muted">
      <Icon name="lucide:loader-circle" class="size-3 animate-spin" />
      <span>{{ t('grid.loading') }}</span>
    </div>

    <UiDialog v-model:open="dialogOpen" :title="dialogColumn?.name ?? ''" :description="dialogColumn?.nativeType">
      <JsonTree v-if="isTree" :value="dialogValue" class="max-h-96 overflow-auto rounded-md border border-border bg-bg-subtle p-2" />
      <pre v-else class="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-bg-subtle p-2 text-xs text-fg">{{ dialogText || t('grid.null') }}</pre>
      <template #footer>
        <UiButton size="sm" variant="secondary" @click="copyText(dialogText || (isTree ? JSON.stringify(dialogValue) : ''))">{{ t('grid.copy') }}</UiButton>
        <UiButton v-if="dialogCanDownload" size="sm" variant="secondary" @click="downloadDialogValue">{{ t('grid.download') }}</UiButton>
        <UiButton v-if="dialogCanFilter" size="sm" variant="secondary" @click="filterByDialogValue">{{ t('grid.filterByValue') }}</UiButton>
      </template>
    </UiDialog>

    <ValueDialog v-model:open="editorDialog.open" :column="editorDialog.column" :value="editorDialog.value" @commit="onEditorDialogCommit" />
  </div>
  </UiContextMenu>
</template>
