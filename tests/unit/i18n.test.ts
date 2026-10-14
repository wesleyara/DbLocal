import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function keys(o: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  )
}
const load = (f: string) => JSON.parse(readFileSync(`i18n/locales/${f}`, 'utf8'))

describe('i18n locales', () => {
  it('have the same set of keys', () => {
    expect(keys(load('pt-BR.json')).sort()).toEqual(keys(load('en.json')).sort())
  })
})
