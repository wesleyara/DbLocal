import { defineStore } from 'pinia'
import {
  addInsert,
  buildOps,
  emptyPending,
  markError,
  pendingCount,
  removeInsert,
  setCell,
  setDeleted,
  setInsertCell,
  undoRow,
  type OpTarget,
  type PendingState,
} from '#shared/pending'
import type { MutationKey, MutationOp } from '#shared/types/mutations'

/**
 * Unsaved edits, per workspace tab. They live in memory only (a reload drops them, and the tab's
 * "unsaved" dot goes with them). The pure rules are in `shared/pending.ts`; this store adds
 * reactivity, the tab scoping and a `version` that other views watch to reload after a save.
 */
export const usePendingStore = defineStore('pending-changes', () => {
  const states = ref<Record<string, PendingState>>({})
  /** Bumped after every successful save, so the grid, the record panel and relation data reload. */
  const version = ref(0)

  function of(tabId: string): PendingState {
    return (states.value[tabId] ??= emptyPending())
  }

  /** Read-only view for rendering: does not create a state for tabs that never edited. */
  function peek(tabId: string): PendingState | null {
    return states.value[tabId] ?? null
  }

  const count = (tabId: string, table?: string): number => {
    const s = states.value[tabId]
    return s ? pendingCount(s, table) : 0
  }

  function edit(tabId: string, table: string, key: MutationKey, original: Record<string, unknown>, column: string, value: unknown): void {
    setCell(of(tabId), table, key, original, column, value)
  }
  function remove(tabId: string, table: string, key: MutationKey, original: Record<string, unknown>, deleted: boolean): void {
    setDeleted(of(tabId), table, key, original, deleted)
  }
  function undo(tabId: string, table: string, key: MutationKey): void {
    undoRow(of(tabId), table, key)
  }
  function insert(tabId: string, table: string, values: Record<string, unknown> = {}): string {
    return addInsert(of(tabId), table, values)
  }
  function editInsert(tabId: string, table: string, id: string, column: string, value: unknown): void {
    setInsertCell(of(tabId), table, id, column, value)
  }
  function removeNew(tabId: string, table: string, id: string): void {
    removeInsert(of(tabId), table, id)
  }
  function discard(tabId: string): void {
    Reflect.deleteProperty(states.value, tabId)
  }
  function batch(tabId: string): { ops: MutationOp[]; targets: OpTarget[] } {
    return buildOps(of(tabId))
  }
  function fail(tabId: string, target: OpTarget, message: string): void {
    markError(of(tabId), target, message)
  }
  function clearErrors(tabId: string): void {
    const s = states.value[tabId]
    if (s) s.errors = {}
  }
  function saved(tabId: string): void {
    discard(tabId)
    version.value++
  }

  return { states, version, peek, count, edit, remove, undo, insert, editInsert, removeNew, discard, batch, fail, clearErrors, saved }
})
