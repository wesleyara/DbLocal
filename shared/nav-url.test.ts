import { describe, expect, it } from 'vitest'
import { decodeRecord, decodeScope, encodeRecord, encodeScope, keyLabel, tablePath } from './nav-url'

describe('nav-url', () => {
  it('round-trips a record, omitting the table when it is the page table', () => {
    const same = encodeRecord('users', { id: 42 }, 'users')
    expect(decodeRecord(same, 'users')).toEqual({ table: 'users', key: { id: 42 } })
    const other = encodeRecord('orders', { id: 7 }, 'users')
    expect(decodeRecord(other, 'users')).toEqual({ table: 'orders', key: { id: 7 } })
  })

  it('round-trips a scope and rejects junk', () => {
    const scope = { table: 'users', relation: 'users.orders', key: { id: 1 } }
    expect(decodeScope(encodeScope(scope))).toEqual(scope)
    expect(decodeScope('not-base64!')).toBeNull()
    expect(decodeRecord(undefined, 'users')).toBeNull()
  })

  it('builds labels and paths', () => {
    expect(keyLabel({ id: 42 })).toBe('#42')
    expect(keyLabel({ country: 'BR', code: 'SP' })).toBe('#BR/SP')
    expect(tablePath('c1', 'public', 'my table', { p: '2', f: undefined })).toBe('/c/c1/public/t/my%20table?p=2')
  })
})
