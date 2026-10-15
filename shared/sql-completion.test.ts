import { describe, expect, it } from 'vitest'
import { suggest, tablesInScope } from './sql-completion'
import type { RelationGraph, SchemaSnapshot } from './types/db'

const col = (name: string, extra = {}) => ({ name, nativeType: 'int', kind: 'number', nullable: false, default: null, isGenerated: false, isPrimaryKey: false, enumValues: null, ...extra })
const snapshot = {
  dialect: 'postgres',
  schema: 'public',
  tables: [
    { name: 'users', kind: 'table', columns: [col('id', { isPrimaryKey: true }), col('email')] },
    { name: 'orders', kind: 'table', columns: [col('id', { isPrimaryKey: true }), col('user_id')] },
  ],
} as unknown as SchemaSnapshot
const ref = (over: object) => ({ relationId: 'r', name: 'orders.user', target: 'orders', cardinality: 'one-to-many', columns: ['id'], targetColumns: ['user_id'], via: null, virtual: false, ...over })
const graph = { tables: { users: { displayColumn: null, outgoing: [], incoming: [ref({})] }, orders: { displayColumn: null, outgoing: [], incoming: [] } }, relations: [] } as unknown as RelationGraph

describe('tablesInScope', () => {
  it('maps aliases, with and without AS, and ignores keywords', () => {
    const s = tablesInScope('select * from users u join public.orders as o on o.user_id = u.id where 1')
    expect(s.get('u')).toBe('users')
    expect(s.get('o')).toBe('orders')
    expect(s.has('where')).toBe(false)
  })
})

describe('suggest', () => {
  it('lists the columns of an alias after the dot, even when FROM comes later', () => {
    const full = 'select u. from users u'
    const out = suggest('select u.', full, snapshot, graph)
    expect(out.map((s) => s.label)).toEqual(['id', 'email'])
  })

  it('suggests a JOIN from the relations of the tables in scope', () => {
    const before = 'select * from users u join '
    const out = suggest(before, before, snapshot, graph)
    expect(out[0]).toMatchObject({ kind: 'join', insert: 'orders o ON o.user_id = u.id' })
  })

  it('offers tables, in-scope columns and keywords elsewhere', () => {
    const before = 'select * from users where '
    const labels = suggest(before, before, snapshot, graph).map((s) => s.label)
    expect(labels).toEqual(expect.arrayContaining(['email', 'orders', 'SELECT', 'count']))
  })

  it('returns nothing for an unknown alias', () => {
    expect(suggest('select zz.', 'select zz.', snapshot, graph)).toEqual([])
  })
})
