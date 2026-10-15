import { describe, expect, it } from 'vitest'
import { fuzzyFilter, fuzzyScore, parsePaletteInput } from './fuzzy'

describe('fuzzyScore', () => {
  it('rejects text that lacks the characters in order', () => {
    expect(fuzzyScore('xyz', 'users')).toBeNull()
    expect(fuzzyScore('sru', 'users')).toBeNull()
  })
  it('ranks exact, prefix, substring and subsequence in that order', () => {
    const exact = fuzzyScore('users', 'users')!
    const prefix = fuzzyScore('use', 'users')!
    const inner = fuzzyScore('ser', 'users')!
    const subsequence = fuzzyScore('usr', 'users')!
    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(inner)
    expect(inner).toBeGreaterThan(subsequence)
  })
  it('prefers word boundaries', () => {
    expect(fuzzyScore('oi', 'order_items')!).toBeGreaterThan(fuzzyScore('oi', 'xoxxixx')!)
  })
  it('matches everything for an empty query', () => {
    expect(fuzzyScore('  ', 'anything')).toBe(0)
  })
})

describe('fuzzyFilter', () => {
  it('drops non matches and sorts by score', () => {
    const names = ['order_items', 'orders', 'users', 'audit_log']
    expect(fuzzyFilter('ord', names, (n) => n)).toEqual(['orders', 'order_items'])
    expect(fuzzyFilter('', names, (n) => n)).toEqual(names)
  })
})

describe('parsePaletteInput', () => {
  it('reads prefixes', () => {
    expect(parsePaletteInput('users')).toEqual({ mode: 'all', term: 'users' })
    expect(parsePaletteInput('> new q')).toEqual({ mode: 'actions', term: 'new q' })
    expect(parsePaletteInput('#users 42')).toEqual({ mode: 'record', table: 'users', pk: '42' })
    expect(parsePaletteInput('#users')).toEqual({ mode: 'record', table: 'users', pk: '' })
  })
})
