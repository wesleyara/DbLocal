import { describe, expect, it } from 'vitest'
import { functionsFor, generateValue, parseFunctionInput } from './edit-functions'
import { parseInput, toInputText } from './edit-values'
import type { SchemaColumn } from './types/db'

const col = (over: Partial<SchemaColumn>): SchemaColumn => ({
  name: 'c', nativeType: 'text', kind: 'string', nullable: false, default: null, isGenerated: false,
  isPrimaryKey: false, comment: null, enumValues: null, ...over,
})

describe('function input', () => {
  it('reads calls, quoted calls and plain text', () => {
    expect(parseFunctionInput(' UUID() ')).toEqual({ kind: 'call', fn: 'uuid' })
    expect(parseFunctionInput('"now()"')).toEqual({ kind: 'literal', text: 'now()' })
    expect(parseFunctionInput('now')).toBeNull()
    expect(parseFunctionInput('uuid(1)')).toBeNull()
    expect(parseFunctionInput('"hello"')).toBeNull()
  })

  it('offers functions per column', () => {
    expect(functionsFor(col({ kind: 'uuid', nativeType: 'uuid' }))).toEqual(['uuid'])
    expect(functionsFor(col({}))).toContain('cuid')
    expect(functionsFor(col({ kind: 'datetime' }))).toEqual(['now'])
    expect(functionsFor(col({ kind: 'number' }))).toEqual(['increment'])
    expect(functionsFor(col({ kind: 'number', isGenerated: true }))).toEqual([])
    expect(functionsFor(col({ kind: 'boolean' }))).toEqual([])
  })
})

describe('generated values', () => {
  it('has the shape of each id', () => {
    const c = col({})
    expect(generateValue('uuid', c)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(generateValue('cuid', c)).toMatch(/^c[0-9a-z]{24}$/)
    expect(generateValue('cuid2', c)).toMatch(/^[a-z][0-9a-z]{23}$/)
    expect(generateValue('ulid', c)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(generateValue('nanoid', c)).toMatch(/^[\w-]{21}$/)
  })

  it('shapes now() by column kind', () => {
    const at = new Date(2026, 9, 14, 8, 5, 3)
    expect(generateValue('now', col({ kind: 'date' }), at)).toBe('2026-10-14')
    expect(generateValue('now', col({ kind: 'time' }), at)).toBe('08:05:03')
    expect(generateValue('now', col({ kind: 'datetime' }), at)).toBe(at.toISOString())
  })
})

describe('parseInput with functions', () => {
  it('generates, defers increment() and rejects the wrong column', () => {
    const uuid = parseInput(col({}), 'uuid()')
    expect(uuid).toMatchObject({ ok: true })
    expect((uuid as { value: string }).value).toHaveLength(36)
    expect(parseInput(col({ kind: 'number', nativeType: 'integer' }), 'increment()')).toEqual({ ok: true, value: { $fn: 'increment' } })
    expect(parseInput(col({ kind: 'number', nativeType: 'integer' }), 'uuid()')).toEqual({ ok: false, error: 'function' })
    const ts = parseInput(col({ kind: 'datetime', nativeType: 'timestamp' }), 'now()')
    expect(ts).toMatchObject({ ok: true })
  })

  it('stores the text of a quoted call', () => {
    expect(parseInput(col({}), '"now()"')).toEqual({ ok: true, value: 'now()' })
    expect(toInputText(col({ kind: 'number' }), { $fn: 'increment' })).toBe('increment()')
  })
})
