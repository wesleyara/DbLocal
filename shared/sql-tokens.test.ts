import { describe, expect, it } from 'vitest'
import { tokenizeSql } from './sql-tokens'

describe('tokenizeSql', () => {
  it('tags keywords, strings, numbers and quoted identifiers, and loses no text', () => {
    const sql = `update "main"."users" set "name" = 'O''Neil <b>' where "id" = 12 returning *`
    const tokens = tokenizeSql(sql)
    expect(tokens.map((t) => t.text).join('')).toBe(sql)
    expect(tokens.filter((t) => t.kind === 'keyword').map((t) => t.text)).toEqual(['update', 'set', 'where', 'returning'])
    expect(tokens.find((t) => t.kind === 'string')!.text).toBe(`'O''Neil <b>'`)
    expect(tokens.find((t) => t.kind === 'number')!.text).toBe('12')
    expect(tokens.filter((t) => t.kind === 'identifier')).toHaveLength(4)
  })
})
