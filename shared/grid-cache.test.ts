import { describe, expect, it } from 'vitest'
import { GridCache, Lru, tablePrefix, VIEWS_PER_TAB } from './grid-cache'

const rows = (n: number) => ({ rows: [{ id: n }], fetchedAt: n })

describe('Lru', () => {
  it('evicts the least recently used entry past the limit', () => {
    const lru = new Lru<number>(2)
    lru.set('a', 1)
    lru.set('b', 2)
    lru.get('a')
    lru.set('c', 3)
    expect(lru.get('b')).toBeUndefined()
    expect(lru.get('a')).toBe(1)
    expect(lru.get('c')).toBe(3)
  })
})

describe('GridCache', () => {
  const users = tablePrefix('c1', 'public', 'users')
  const orders = tablePrefix('c1', 'public', 'orders')

  it('misses, then hits, per tab', () => {
    const cache = new GridCache()
    expect(cache.getRows('t1', `${users}|{}`)).toBeUndefined()
    cache.setRows('t1', `${users}|{}`, rows(1))
    expect(cache.getRows('t1', `${users}|{}`)?.rows).toEqual([{ id: 1 }])
    expect(cache.getRows('t2', `${users}|{}`)).toBeUndefined()
  })

  it('keeps only the last view of a tab', () => {
    const cache = new GridCache()
    expect(VIEWS_PER_TAB).toBe(1)
    cache.setRows('t1', `${users}|page1`, rows(1))
    cache.setRows('t1', `${users}|page2`, rows(2))
    expect(cache.getRows('t1', `${users}|page1`)).toBeUndefined()
    expect(cache.getRows('t1', `${users}|page2`)).toBeDefined()
    // Another tab has its own last view.
    cache.setRows('t2', `${users}|page1`, rows(3))
    expect(cache.getRows('t1', `${users}|page2`)).toBeDefined()
  })

  it('invalidates one table without touching the others', () => {
    const cache = new GridCache()
    cache.setRows('t1', `${users}|a`, rows(1))
    cache.setCount('t1', `${users}|a`, { total: 3, exact: true, fetchedAt: 1 })
    cache.setRows('t2', `${orders}|a`, rows(2))
    cache.relations('t1', users).asked.set('1', new Set(['orders']))
    cache.invalidateTable('t1', users)
    expect(cache.getRows('t1', `${users}|a`)).toBeUndefined()
    expect(cache.getCount('t1', `${users}|a`)).toBeUndefined()
    expect(cache.relations('t1', users).asked.size).toBe(0)
    expect(cache.getRows('t2', `${orders}|a`)).toBeDefined()
  })

  it('does not confuse a table with another that shares its prefix', () => {
    const cache = new GridCache()
    const userRoles = tablePrefix('c1', 'public', 'users_roles')
    cache.setRows('t1', `${userRoles}|a`, rows(1))
    cache.invalidateTable('t1', users)
    expect(cache.getRows('t1', `${userRoles}|a`)).toBeDefined()
  })

  it('invalidates a connection in every tab, and clears data but keeps prefs', () => {
    const cache = new GridCache()
    const other = tablePrefix('c2', 'public', 'users')
    cache.setRows('t1', `${users}|a`, rows(1))
    cache.setRows('t2', `${users}|a`, rows(2))
    cache.setRows('t3', `${other}|a`, rows(3))
    cache.invalidateConnection('c1')
    expect(cache.getRows('t1', `${users}|a`)).toBeUndefined()
    expect(cache.getRows('t2', `${users}|a`)).toBeUndefined()
    expect(cache.getRows('t3', `${other}|a`)).toBeDefined()

    const prefs = { widths: {}, hidden: ['x'], order: [], pinned: [] }
    cache.setPrefs('t3', other, prefs)
    cache.clearData()
    expect(cache.getRows('t3', `${other}|a`)).toBeUndefined()
    expect(cache.getPrefs('t3', other)).toEqual(prefs)
  })

  it('drops tabs that are gone', () => {
    const cache = new GridCache()
    cache.setRows('t1', `${users}|a`, rows(1))
    cache.setRows('t2', `${users}|a`, rows(2))
    cache.keepTabs(['t2'])
    expect(cache.getRows('t1', `${users}|a`)).toBeUndefined()
    expect(cache.getRows('t2', `${users}|a`)).toBeDefined()
  })
})
