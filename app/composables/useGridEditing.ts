import type { RelationRef, SchemaTable } from '#shared/types/db'
import { keyId, rowErrorId, insertErrorId } from '#shared/pending'
import { rowKey } from '~/composables/useRelationData'
import { usePendingStore } from '~/stores/pending-changes'
import { useSchemaStore } from '~/stores/schema'
import { metaOf, ROW_META, type RowMeta } from '~/components/grid/row-meta'

export interface GridEditingSource {
  /** The table the rows belong to (null: nothing is editable). */
  table: () => SchemaTable | null
  /** Columns that address a row (`editableKey`), or null when rows cannot be edited. */
  keyColumns: () => string[] | null
  /** Rows as loaded from the server: edits are compared against them, not against the overlay. */
  loadedRows: () => Record<string, unknown>[]
  /** N:1 / 1:1 refs of the table whose FK columns are picked, not typed. */
  parentRefs: () => RelationRef[]
  tabId: () => string
}

/**
 * Editing on top of a list of loaded rows, shared by the table grid and editable query results:
 * the pending overlay, cell edits, deletes (with the impact dialog), undo and the FK picker. The
 * changes go to the tab's pending store, saved by `PendingBar`.
 */
export function useGridEditing(source: GridEditingSource) {
  const pendingStore = usePendingStore()
  const schemaStore = useSchemaStore()

  const tableName = computed(() => source.table()?.name ?? '')
  const pendingState = computed(() => pendingStore.peek(source.tabId()))
  const pendingTable = computed(() => pendingState.value?.tables[tableName.value] ?? null)

  /** New rows of the tab, first in the grid. */
  const insertRows = computed<Record<string, unknown>[]>(() => {
    const errors = pendingState.value?.errors ?? {}
    return (pendingTable.value?.inserts ?? []).map((insert) => {
      const meta: RowMeta = { state: 'new', id: insert.id, changed: {}, error: errors[insertErrorId(tableName.value, insert.id)] }
      return { ...insert.values, [ROW_META]: meta }
    })
  })

  /** Puts the pending edits of `row` (a loaded row) on `next`, a copy the caller may have extended. */
  function overlay(row: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
    const key = source.keyColumns()
    const rowKeyValue = key ? rowKey(key, row) : null
    const pending = rowKeyValue ? pendingTable.value?.rows[keyId(rowKeyValue)] : undefined
    if (!rowKeyValue || !pending) return next
    const changed: RowMeta['changed'] = {}
    for (const [column, value] of Object.entries(pending.changes)) {
      changed[column] = { original: row[column] }
      next[column] = value
    }
    next[ROW_META] = {
      state: pending.deleted ? 'deleted' : null,
      changed,
      key: rowKeyValue,
      error: pendingState.value?.errors[rowErrorId(tableName.value, rowKeyValue)],
    } satisfies RowMeta
    return next
  }

  const loadedByKey = computed(() => {
    const map = new Map<string, Record<string, unknown>>()
    const key = source.keyColumns()
    if (!key) return map
    for (const row of source.loadedRows()) {
      const k = rowKey(key, row)
      if (k) map.set(keyId(k), row)
    }
    return map
  })

  function keyOf(row: Record<string, unknown>): Record<string, string | number> | null {
    const key = source.keyColumns()
    return metaOf(row)?.key ?? (key ? rowKey(key, row) : null)
  }

  function applyEdit(row: Record<string, unknown>, column: string, value: unknown): void {
    const tab = source.tabId()
    const meta = metaOf(row)
    if (meta?.state === 'new' && meta.id) {
      pendingStore.editInsert(tab, tableName.value, meta.id, column, value)
      return
    }
    const key = keyOf(row)
    if (!key) return
    const original = loadedByKey.value.get(keyId(key))
    if (!original) return
    pendingStore.edit(tab, tableName.value, key, original, column, value)
  }

  function undoRow(row: Record<string, unknown>): void {
    const meta = metaOf(row)
    if (meta?.state === 'new' && meta.id) pendingStore.removeNew(source.tabId(), tableName.value, meta.id)
    else {
      const key = keyOf(row)
      if (key) pendingStore.undo(source.tabId(), tableName.value, key)
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
        pendingStore.removeNew(source.tabId(), tableName.value, meta.id)
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
      if (original) pendingStore.remove(source.tabId(), tableName.value, key, original, true)
    }
    deleteKeys.value = []
  }

  function restoreRows(rows: Record<string, unknown>[]): void {
    for (const row of rows) {
      const key = keyOf(row)
      const original = key ? loadedByKey.value.get(keyId(key)) : undefined
      if (key && original) pendingStore.remove(source.tabId(), tableName.value, key, original, false)
    }
  }

  // ---- foreign key editing: pick the parent record -------------------------------------------
  const pickerOpen = ref(false)
  const pickerRow = ref<Record<string, unknown> | null>(null)
  const pickerRef = ref<RelationRef | null>(null)

  /** FK columns that have a navigable parent relation: these are picked, not typed. */
  const pickableColumns = computed(() => {
    const names = new Set<string>()
    for (const ref of source.parentRefs()) ref.columns.forEach((c) => names.add(c))
    return [...names]
  })
  const columnHasDefault = (name: string): boolean => {
    const table = source.table()
    const column = table?.columns.find((c) => c.name === name)
    if (!table || !column) return false
    // A lone integer key is filled by the database (rowid / serial / auto_increment) when omitted.
    const autoKey = column.isPrimaryKey && column.kind === 'number' && table.primaryKey.length === 1
    return column.default !== null || column.isGenerated || autoKey
  }
  const pickerTarget = computed(() => schemaStore.tables.find((tb) => tb.name === pickerRef.value?.target) ?? null)

  function editForeignKey(row: Record<string, unknown>, column: string): void {
    const ref = source.parentRefs().find((r) => r.columns.includes(column))
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
    const table = source.table()
    return !!ref && !!table && ref.columns.every((c) => table.columns.find((col) => col.name === c)?.nullable)
  })

  return {
    pendingState,
    pendingTable,
    insertRows,
    overlay,
    loadedByKey,
    keyOf,
    applyEdit,
    undoRow,
    deleteKeys,
    deleteOpen,
    requestDelete,
    confirmDelete,
    restoreRows,
    pickerOpen,
    pickerRef,
    pickerTarget,
    pickableColumns,
    columnHasDefault,
    editForeignKey,
    onPick,
    pickerNullable,
  }
}
