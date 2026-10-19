import { describe, expect, it } from 'vitest'
import { autoMapping, batches, buildImportOps, cellValue, missingColumns } from './import-map'
import { detectDelimiter, detectFormat, parseCsv, parseJson } from './import-parse'
import type { SchemaColumn, SchemaTable } from './types/db'

const col = (name: string, kind: SchemaColumn['kind'], extra: Partial<SchemaColumn> = {}): SchemaColumn => ({
  name,
  nativeType: kind === 'number' ? 'integer' : 'text',
  kind,
  nullable: true,
  default: null,
  isGenerated: false,
  isPrimaryKey: false,
  comment: null,
  enumValues: null,
  ...extra,
})

const users: SchemaTable = {
  name: 'users',
  kind: 'table',
  columns: [
    col('id', 'number', { isPrimaryKey: true, nullable: false, isGenerated: true, identity: true }),
    col('full_name', 'string', { nullable: false }),
    col('active', 'boolean', { nullable: false, default: 'true' }),
    col('born', 'date'),
    col('meta', 'json'),
    col('avatar', 'binary'),
    col('slug', 'string', { isGenerated: true }),
  ],
  primaryKey: ['id'],
  foreignKeys: [],
  indexes: [],
} as unknown as SchemaTable

const options = { mode: 'insert' as const, emptyAsNull: true }

describe('parseCsv', () => {
  it('reads quotes, doubled quotes, line breaks in cells, CRLF and a BOM', () => {
    const res = parseCsv('﻿id,name\r\n1,"Ana ""A"" Silva"\r\n2,"two\nlines"\r\n\r\n')
    expect(res).toEqual({ ok: true, data: { columns: ['id', 'name'], rows: [['1', 'Ana "A" Silva'], ['2', 'two\nlines']] } })
  })

  it('names blank and repeated headers and pads short rows', () => {
    const res = parseCsv('a;;a\n1')
    expect(res).toEqual({ ok: true, data: { columns: ['a', 'column_2', 'a_2'], rows: [['1', '', '']] } })
  })

  it('fails on an open quote and on an empty file', () => {
    expect(parseCsv('a\n"open')).toEqual({ ok: false, error: 'csvQuote' })
    expect(parseCsv('\n\n')).toEqual({ ok: false, error: 'empty' })
  })

  it('detects the delimiter from the header, outside quotes', () => {
    expect(detectDelimiter('a;b;c\n1,2;3')).toBe(';')
    expect(detectDelimiter('"x,y"\tb\n')).toBe('\t')
    expect(detectDelimiter('single')).toBe(',')
  })
})

describe('parseJson', () => {
  it('reads an array of objects and joins their keys', () => {
    const res = parseJson('[{"a":1},{"b":null,"a":2}]')
    expect(res).toEqual({ ok: true, data: { columns: ['a', 'b'], rows: [[1, undefined], [2, null]] } })
  })

  it('reads JSON lines and rejects other shapes', () => {
    expect(parseJson('{"a":1}\n{"a":2}\n')).toMatchObject({ ok: true, data: { rows: [[1], [2]] } })
    expect(parseJson('[1,2]')).toEqual({ ok: false, error: 'jsonShape' })
    expect(parseJson('{oops')).toEqual({ ok: false, error: 'json' })
  })

  it('picks the format from the name, then from the text', () => {
    expect(detectFormat('x.json', 'a,b')).toBe('json')
    expect(detectFormat('x.csv', '[')).toBe('csv')
    expect(detectFormat('clip', '  [{"a":1}]')).toBe('json')
  })
})

describe('mapping', () => {
  it('matches names ignoring case and separators, never twice, never computed or binary columns', () => {
    expect(autoMapping(['ID', 'Full Name', 'full-name', 'avatar', 'slug', 'other'], users)).toEqual({
      ID: 'id',
      'Full Name': 'full_name',
      'full-name': null,
      avatar: null,
      slug: null,
      other: null,
    })
  })

  it('lists the NOT NULL columns without default, and the key for an upsert', () => {
    expect(missingColumns(users, { id: null }, 'insert')).toEqual(['full_name'])
    expect(missingColumns(users, { n: 'full_name' }, 'upsert')).toEqual(['id'])
  })
})

describe('cell values', () => {
  const by = (n: string) => users.columns.find((c) => c.name === n)!

  it('reads booleans in several spellings and rejects others', () => {
    expect(cellValue(by('active'), 'Sim', options)).toEqual({ ok: true, value: true })
    expect(cellValue(by('active'), 0, options)).toEqual({ ok: true, value: false })
    expect(cellValue(by('active'), 'maybe', options)).toEqual({ ok: false, code: 'boolean' })
  })

  it('turns an empty cell into NULL, or DEFAULT for a NOT NULL column with one', () => {
    expect(cellValue(by('born'), '', options)).toEqual({ ok: true, value: null })
    expect(cellValue(by('active'), '', options)).toEqual({ ok: true, value: { $default: true } })
    expect(cellValue(by('full_name'), '', { ...options, emptyAsNull: false })).toEqual({ ok: true, value: '' })
  })

  it('keeps JSON values, checks dates and numbers', () => {
    expect(cellValue(by('meta'), { a: 1 }, options)).toEqual({ ok: true, value: { a: 1 } })
    expect(cellValue(by('meta'), '{"a":1}', options)).toEqual({ ok: true, value: { a: 1 } })
    expect(cellValue(by('born'), '2024-02-30', options)).toEqual({ ok: false, code: 'date' })
    expect(cellValue(by('id'), '12', options)).toEqual({ ok: true, value: 12 })
    expect(cellValue(by('id'), '1.5', options)).toEqual({ ok: false, code: 'integer' })
  })

  it('takes function names literally', () => {
    expect(cellValue(by('full_name'), 'now()', options)).toEqual({ ok: true, value: 'now()' })
  })
})

describe('buildImportOps', () => {
  const data = { columns: ['id', 'full_name', 'born'], rows: [['1', 'Ana', ''], ['x', 'Bruno', 'bad'], ['3', 'Caio', '2024-01-02']] }
  const mapping = { id: 'id', full_name: 'full_name', born: 'born' }

  it('builds inserts for valid records and reports every invalid cell', () => {
    const res = buildImportOps(data, mapping, users, options)
    expect(res.ops).toEqual([
      { type: 'insert', table: 'users', values: { id: 1, full_name: 'Ana', born: null } },
      { type: 'insert', table: 'users', values: { id: 3, full_name: 'Caio', born: '2024-01-02' } },
    ])
    expect(res.rows).toEqual([0, 2])
    expect(res.invalidRows).toBe(1)
    expect(res.errors).toEqual([
      { row: 1, column: 'id', code: 'integer' },
      { row: 1, column: 'born', code: 'date' },
    ])
  })

  it('builds upserts and leaves unmapped columns out', () => {
    const res = buildImportOps(data, { id: 'id', full_name: 'full_name', born: null }, users, { ...options, mode: 'upsert' })
    expect(res.ops[0]).toEqual({ type: 'upsert', table: 'users', values: { id: 1, full_name: 'Ana' } })
  })

  it('splits ops in batches', () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})
