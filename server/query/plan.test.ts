import { describe, expect, it } from 'vitest'
import type { SchemaSnapshot, SchemaTable } from '#shared/types/db'
import type { RowsRequest } from '#shared/types/rows'
import { planRows } from './plan'
import { QueryInputError } from './errors'

const table = (over: Partial<SchemaTable> = {}): SchemaTable => ({
  name: 'orders',
  kind: 'table',
  columns: [
    { name: 'id', nativeType: 'int', kind: 'number', nullable: false, default: null, isGenerated: true, isPrimaryKey: true, comment: null, enumValues: null },
    { name: 'status', nativeType: 'text', kind: 'enum', nullable: false, default: null, isGenerated: false, isPrimaryKey: false, comment: null, enumValues: ['paid', 'open'] },
    { name: 'note', nativeType: 'text', kind: 'string', nullable: true, default: null, isGenerated: false, isPrimaryKey: false, comment: null, enumValues: null },
    { name: 'paid', nativeType: 'bool', kind: 'boolean', nullable: false, default: null, isGenerated: false, isPrimaryKey: false, comment: null, enumValues: null },
    { name: 'payload', nativeType: 'json', kind: 'json', nullable: true, default: null, isGenerated: false, isPrimaryKey: false, comment: null, enumValues: null },
  ],
  primaryKey: ['id'],
  foreignKeys: [],
  indexes: [],
  implicitRowid: false,
  rowEstimate: 10,
  comment: null,
  ...over,
})

const snapshot = (tables: SchemaTable[] = [table()]): SchemaSnapshot => ({
  dialect: 'postgres',
  schema: 'public',
  tables,
  readAt: '2026-10-14T00:00:00.000Z',
})

const req = (over: Partial<RowsRequest> = {}): RowsRequest => ({
  schema: 'public',
  filter: null,
  sort: [],
  limit: 100,
  offset: 0,
  ...over,
})

describe('planRows', () => {
  it('appends the primary key to the sort so pages are stable', () => {
    const plan = planRows(snapshot(), 'orders', req({ sort: [{ column: 'status', direction: 'desc' }] }))
    expect(plan.sort).toEqual([
      { column: 'status', direction: 'desc' },
      { column: 'id', direction: 'asc' },
    ])
  })

  it('does not repeat the primary key when it is already sorted', () => {
    const plan = planRows(snapshot(), 'orders', req({ sort: [{ column: 'id', direction: 'desc' }] }))
    expect(plan.sort).toEqual([{ column: 'id', direction: 'desc' }])
  })

  it('rejects an unknown table with 404', () => {
    expect(() => planRows(snapshot(), 'nope', req())).toThrow(QueryInputError)
    try {
      planRows(snapshot(), 'nope', req())
    } catch (err) {
      expect((err as QueryInputError).status).toBe(404)
    }
  })

  it('rejects unknown columns in filter, sort and column list', () => {
    const bad = (r: RowsRequest) => () => planRows(snapshot(), 'orders', r)
    expect(bad(req({ filter: { type: 'condition', column: 'ghost', op: 'eq', value: 1 } }))).toThrow(/Unknown column/)
    expect(bad(req({ sort: [{ column: 'ghost', direction: 'asc' }] }))).toThrow(/Unknown column/)
    expect(bad(req({ columns: ['id', 'ghost'] }))).toThrow(/Unknown column/)
  })

  it('rejects an operator the column kind does not allow', () => {
    const filter = { type: 'condition' as const, column: 'payload', op: 'contains' as const, value: 'x' }
    expect(() => planRows(snapshot(), 'orders', req({ filter }))).toThrow(/not valid for json/)
    const enumLike = { type: 'condition' as const, column: 'status', op: 'contains' as const, value: 'pa' }
    expect(() => planRows(snapshot(), 'orders', req({ filter: enumLike }))).toThrow(/not valid for enum/)
  })

  it('checks the value shape against the operator arity', () => {
    const cond = (op: 'eq' | 'in' | 'between' | 'is_null', value?: string | string[]) => ({
      type: 'condition' as const,
      column: 'note',
      op,
      value,
    })
    expect(() => planRows(snapshot(), 'orders', req({ filter: cond('eq') }))).toThrow(/needs one value/)
    expect(() => planRows(snapshot(), 'orders', req({ filter: cond('eq', ['a']) }))).toThrow(/needs one value/)
    expect(() => planRows(snapshot(), 'orders', req({ filter: cond('in', []) }))).toThrow(/list/)
    expect(() => planRows(snapshot(), 'orders', req({ filter: cond('between', ['a']) }))).toThrow(/two values/)
    expect(() => planRows(snapshot(), 'orders', req({ filter: cond('is_null', 'x') }))).toThrow(/takes no value/)
    expect(() => planRows(snapshot(), 'orders', req({ filter: cond('is_null') }))).not.toThrow()
  })

  it('accepts a nested AND/OR filter over valid columns', () => {
    const filter = {
      type: 'group' as const,
      logic: 'and' as const,
      children: [
        { type: 'condition' as const, column: 'paid', op: 'is_true' as const },
        {
          type: 'group' as const,
          logic: 'or' as const,
          children: [{ type: 'condition' as const, column: 'note', op: 'starts_with' as const, value: 'a' }],
        },
      ],
    }
    expect(() => planRows(snapshot(), 'orders', req({ filter }))).not.toThrow()
  })
})

describe('grid prefs schema', () => {
  it('rejects widths outside the allowed range', async () => {
    const { gridPrefsSchema } = await import('#shared/schemas/rows')
    expect(gridPrefsSchema.safeParse({ widths: { id: 10 }, hidden: [] }).success).toBe(false)
    expect(gridPrefsSchema.safeParse({ widths: { id: 180 }, hidden: ['note'] }).success).toBe(true)
  })
})
