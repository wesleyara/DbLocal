import { describe, expect, it } from 'vitest'
import { fkHasNull, hasNullPart } from './fk'

describe('fk null parts', () => {
  it('treats any NULL part as a NULL key', () => {
    expect(hasNullPart([1, 2])).toBe(false)
    expect(hasNullPart([1, null])).toBe(true)
    expect(hasNullPart([undefined])).toBe(true)
    expect(fkHasNull(['order_id', 'shipment_no'], { order_id: 5, shipment_no: null })).toBe(true)
    expect(fkHasNull(['order_id', 'shipment_no'], { order_id: 5, shipment_no: 1 })).toBe(false)
    expect(fkHasNull(['order_id'], { order_id: 0 })).toBe(false)
  })
})
