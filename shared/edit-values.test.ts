import { describe, expect, it } from 'vitest'
import type { SchemaColumn } from './types/db'
import { nextBoolean, parseInput, toInputText } from './edit-values'

const col = (kind: SchemaColumn['kind'], nativeType = kind as string): SchemaColumn => ({
  name: 'c',
  nativeType,
  kind,
  nullable: true,
  default: null,
  isGenerated: false,
  isPrimaryKey: false,
  comment: null,
  enumValues: null,
})

describe('parseInput', () => {
  it('validates numbers and keeps big integers as text', () => {
    expect(parseInput(col('number', 'integer'), '42')).toEqual({ ok: true, value: 42 })
    expect(parseInput(col('number', 'integer'), '4.2')).toEqual({ ok: false, error: 'integer' })
    expect(parseInput(col('number', 'numeric(10,2)'), '4.25')).toEqual({ ok: true, value: 4.25 })
    expect(parseInput(col('number', 'numeric(10,2)'), 'abc')).toEqual({ ok: false, error: 'number' })
    expect(parseInput(col('number', 'bigint'), '9007199254740993')).toEqual({ ok: true, value: '9007199254740993' })
    expect(parseInput(col('number', 'integer'), '')).toEqual({ ok: true, value: null })
  })

  it('validates json and arrays', () => {
    expect(parseInput(col('json'), '{"a":[1]}')).toEqual({ ok: true, value: { a: [1] } })
    expect(parseInput(col('json'), '{a:1}')).toEqual({ ok: false, error: 'json' })
    expect(parseInput(col('array'), '[1,2]')).toEqual({ ok: true, value: [1, 2] })
    expect(parseInput(col('array'), '{"a":1}')).toEqual({ ok: false, error: 'array' })
  })

  it('validates dates, times and uuids; datetimes become ISO instants', () => {
    expect(parseInput(col('date'), '2026-02-30')).toEqual({ ok: false, error: 'date' })
    expect(parseInput(col('date'), '2026-02-03')).toEqual({ ok: true, value: '2026-02-03' })
    expect(parseInput(col('time'), '10:30')).toEqual({ ok: true, value: '10:30' })
    expect(parseInput(col('time'), '25')).toEqual({ ok: false, error: 'time' })
    expect(parseInput(col('uuid'), 'nope')).toEqual({ ok: false, error: 'uuid' })
    const dt = parseInput(col('datetime'), '2026-01-02T03:04:05')
    expect(dt.ok && typeof dt.value === 'string' && dt.value.endsWith('Z')).toBe(true)
    expect(parseInput(col('datetime'), 'yesterday-ish')).toEqual({ ok: false, error: 'datetime' })
  })

  it('leaves text alone, empty string included', () => {
    expect(parseInput(col('string'), '')).toEqual({ ok: true, value: '' })
    expect(parseInput(col('string'), ' a ')).toEqual({ ok: true, value: ' a ' })
  })
})

describe('inputs and booleans', () => {
  it('pretty-prints json for the editor and shows local datetimes', () => {
    expect(toInputText(col('json'), { a: 1 })).toBe('{\n  "a": 1\n}')
    expect(toInputText(col('string'), null)).toBe('')
    expect(toInputText(col('date'), '2026-02-03T00:00:00.000Z')).toBe('2026-02-03')
  })

  it('cycles booleans through NULL only when the column allows it', () => {
    expect(nextBoolean(true, true)).toBe(false)
    expect(nextBoolean(false, true)).toBeNull()
    expect(nextBoolean(false, false)).toBe(true)
    expect(nextBoolean(null, true)).toBe(true)
    expect(nextBoolean(1, false)).toBe(false)
  })
})
