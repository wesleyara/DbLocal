import { describe, expect, it } from 'vitest'
import { decodeRecord, decodeScope } from './nav-url'
import { initialTourState, readTourState, TOUR_STEPS, tourPath } from './tour'

const ctx = { connectionId: 'abc', schema: 'main' }

describe('tour', () => {
  it('has unique step ids', () => {
    const ids = TOUR_STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('builds a path inside the demo connection for every step', () => {
    for (const step of TOUR_STEPS) expect(tourPath(step.id, ctx)).toMatch(/^\/c\/abc\/main/)
  })

  it('encodes the record and the relation scope the steps rely on', () => {
    const record = new URL(tourPath('record', ctx), 'http://x').searchParams.get('r')
    expect(decodeRecord(record, 'orders')).toEqual({ table: 'orders', key: { id: 1 } })
    const scope = new URL(tourPath('related', ctx), 'http://x').searchParams.get('rel')
    expect(decodeScope(scope)).toEqual({ table: 'users', relation: 'users.orders', key: { id: 1 } })
  })

  it('reads saved state defensively', () => {
    expect(readTourState(null)).toEqual(initialTourState())
    expect(readTourState('{not json')).toEqual(initialTourState())
    expect(readTourState('{"status":"running","step":99,"connectionId":"x"}')).toMatchObject({
      status: 'running',
      step: TOUR_STEPS.length - 1,
    })
    expect(readTourState('{"status":"running","step":2}').status).toBe('new')
    expect(readTourState('{"status":"done"}').status).toBe('done')
  })
})
