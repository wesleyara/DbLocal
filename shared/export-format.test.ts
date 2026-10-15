import { describe, expect, it } from 'vitest'
import { csvLine, formatResult } from './export-format'

describe('export format', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvLine(['a,b', 'say "hi"', 'x\ny', 1, null, true])).toBe('"a,b","say ""hi""","x\ny",1,,true')
  })

  it('writes a header and CRLF records', () => {
    expect(formatResult('csv', ['id', 'name'], [{ id: 1, name: 'Ana' }])).toBe('id,name\r\n1,Ana\r\n')
  })

  it('serialises objects inside cells as JSON', () => {
    expect(csvLine([{ a: 1 }])).toBe('"{""a"":1}"')
  })

  it('writes a JSON array', () => {
    expect(JSON.parse(formatResult('json', ['id'], [{ id: 1 }, { id: 2 }]))).toEqual([{ id: 1 }, { id: 2 }])
  })
})
