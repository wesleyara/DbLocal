import { describe, expect, it } from 'vitest'
import {
  addInsert,
  buildOps,
  emptyPending,
  insertErrorId,
  keyId,
  markError,
  pendingCount,
  removeInsert,
  rowErrorId,
  setCell,
  setDeleted,
  setInsertCell,
  undoRow,
} from './pending'

const row = { id: 1, name: 'Ana', age: 30 }

describe('pending changes', () => {
  it('keeps only the columns that changed and drops an edit that returns to the loaded value', () => {
    const s = emptyPending()
    setCell(s, 'users', { id: 1 }, row, 'name', 'Ana Souza')
    setCell(s, 'users', { id: 1 }, row, 'age', 31)
    expect(s.tables.users!.rows[keyId({ id: 1 })]!.changes).toEqual({ name: 'Ana Souza', age: 31 })
    setCell(s, 'users', { id: 1 }, row, 'name', 'Ana')
    expect(s.tables.users!.rows[keyId({ id: 1 })]!.changes).toEqual({ age: 31 })
    setCell(s, 'users', { id: 1 }, row, 'age', '30') // "30" is the loaded 30
    expect(pendingCount(s)).toBe(0)
    expect(s.tables).toEqual({})
  })

  it('addresses rows by key, whatever the property order', () => {
    expect(keyId({ a: 1, b: 2 })).toBe(keyId({ b: 2, a: 1 }))
  })

  it('counts rows, inserts and deletes once each', () => {
    const s = emptyPending()
    setCell(s, 'users', { id: 1 }, row, 'name', 'X')
    setCell(s, 'users', { id: 1 }, row, 'age', 1)
    setDeleted(s, 'users', { id: 2 }, { id: 2, name: 'B' }, true)
    addInsert(s, 'orders', { total: 5 })
    expect(pendingCount(s)).toBe(3)
    expect(pendingCount(s, 'users')).toBe(2)
  })

  it('orders the batch: inserts, then updates, then deletes, each in the order the user made them', () => {
    const s = emptyPending()
    setDeleted(s, 'users', { id: 9 }, { id: 9 }, true)
    setCell(s, 'users', { id: 1 }, row, 'name', 'X')
    const first = addInsert(s, 'users', { name: 'New 1' })
    addInsert(s, 'orders', { user_id: 5 })
    const { ops, targets } = buildOps(s)
    expect(ops.map((o) => o.type)).toEqual(['insert', 'insert', 'update', 'delete'])
    expect(targets[0]).toEqual({ table: 'users', kind: 'insert', id: first })
    expect(ops[2]).toEqual({ type: 'update', table: 'users', pk: { id: 1 }, values: { name: 'X' } })
  })

  it('a deleted row sends only the delete, even with edits', () => {
    const s = emptyPending()
    setCell(s, 'users', { id: 1 }, row, 'name', 'X')
    setDeleted(s, 'users', { id: 1 }, row, true)
    expect(buildOps(s).ops).toEqual([{ type: 'delete', table: 'users', pk: { id: 1 } }])
    setDeleted(s, 'users', { id: 1 }, row, false)
    expect(buildOps(s).ops).toHaveLength(1)
    expect(buildOps(s).ops[0]!.type).toBe('update')
  })

  it('new rows: unset columns take their default, a cleared one is omitted again', () => {
    const s = emptyPending()
    const id = addInsert(s, 'users', {})
    setInsertCell(s, 'users', id, 'name', 'Zed')
    setInsertCell(s, 'users', id, 'role', { $default: true })
    expect(buildOps(s).ops[0]).toEqual({ type: 'insert', table: 'users', values: { name: 'Zed', role: { $default: true } } })
    setInsertCell(s, 'users', id, 'role', undefined)
    expect((buildOps(s).ops[0] as { values: object }).values).toEqual({ name: 'Zed' })
    removeInsert(s, 'users', id)
    expect(pendingCount(s)).toBe(0)
  })

  it('DEFAULT on an existing cell is a change even when the loaded value looks the same', () => {
    const s = emptyPending()
    setCell(s, 'users', { id: 1 }, { id: 1, role: 'user' }, 'role', { $default: true })
    expect(buildOps(s).ops[0]).toMatchObject({ values: { role: { $default: true } } })
  })

  it('keeps errors on the row until it is edited or undone', () => {
    const s = emptyPending()
    setCell(s, 'users', { id: 1 }, row, 'name', 'X')
    const id = addInsert(s, 'users', { name: 'n' })
    markError(s, { table: 'users', kind: 'row', key: { id: 1 } }, 'duplicate key')
    markError(s, { table: 'users', kind: 'insert', id }, 'not null')
    expect(s.errors[rowErrorId('users', { id: 1 })]).toBe('duplicate key')
    expect(s.errors[insertErrorId('users', id)]).toBe('not null')
    setCell(s, 'users', { id: 1 }, row, 'name', 'Y')
    expect(s.errors[rowErrorId('users', { id: 1 })]).toBeUndefined()
    undoRow(s, 'users', { id: 1 })
    expect(pendingCount(s)).toBe(1)
  })
})

describe('numeric cells', () => {
  it('does not count "50.00" edited to 50 as a change', () => {
    const state = emptyPending()
    setCell(state, 't', { id: 1 }, { id: 1, amount: '50.00' }, 'amount', 50)
    expect(state.tables.t).toBeUndefined()
    setCell(state, 't', { id: 1 }, { id: 1, amount: '50.00' }, 'amount', 50.5)
    expect(state.tables.t!.rows[keyId({ id: 1 })]!.changes).toEqual({ amount: 50.5 })
    setCell(state, 't', { id: 1 }, { id: 1, amount: '50.00' }, 'amount', 50)
    expect(state.tables.t).toBeUndefined()
  })

  it('only equates a number with its text form, never two texts', () => {
    const state = emptyPending()
    setCell(state, 't', { id: 1 }, { id: 1, label: '1.0' }, 'label', '1')
    expect(state.tables.t).toBeDefined()
    setCell(state, 't', { id: 2 }, { id: 2, n: '-0.50' }, 'n', -0.5)
    expect(state.tables.t!.rows[keyId({ id: 2 })]).toBeUndefined()
  })
})
