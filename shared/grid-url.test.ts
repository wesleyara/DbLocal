import { describe, expect, it } from 'vitest'
import { decodeUrlState, encodeUrlState } from './grid-url'

describe('grid URL state', () => {
  it('round-trips nested filters with UTF-8 text', () => {
    const state = {
      filter: { type: 'condition', column: 'nome', op: 'contains', value: 'José ✓' },
      sort: [{ column: 'id', direction: 'desc' }],
    }
    const encoded = encodeUrlState(state)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeUrlState(encoded)).toEqual(state)
  })

  it('returns null for missing or corrupt input instead of throwing', () => {
    expect(decodeUrlState(null)).toBeNull()
    expect(decodeUrlState('')).toBeNull()
    expect(decodeUrlState('%%%not-base64')).toBeNull()
    expect(decodeUrlState(encodeUrlState('ok').slice(0, -2) + '!!')).toBeNull()
  })
})
