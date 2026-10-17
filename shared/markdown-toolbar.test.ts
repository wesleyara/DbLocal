import { describe, expect, it } from 'vitest'
import { applyInsert, bold, heading, link, sqlBlock, table, task } from './markdown-toolbar'

describe('markdown toolbar', () => {
  it('wraps the selection and keeps it selected', () => {
    const { value, selection } = applyInsert('see users now', 4, 9, bold('bold'))
    expect(value).toBe('see **users** now')
    expect(value.slice(...selection)).toBe('users')
  })

  it('inserts the placeholder when nothing is selected, selected for typing', () => {
    const { value, selection } = applyInsert('', 0, 0, bold('negrito'))
    expect(value).toBe('**negrito**')
    expect(value.slice(...selection)).toBe('negrito')
  })

  it('prefixes lines for headings and tasks', () => {
    expect(applyInsert('', 0, 0, heading(2)('Heading')).value).toBe('## Heading')
    expect(applyInsert('x', 0, 1, task('to-do')).value).toBe('- [ ] x')
  })

  it('selects the URL of a link', () => {
    const { value, selection } = applyInsert('docs', 0, 4, link('text'))
    expect(value).toBe('[docs](https://)')
    expect(value.slice(...selection)).toBe('https://')
  })

  it('fences SQL and selects the statement', () => {
    const { value, selection } = applyInsert('', 0, 0, sqlBlock('select 1'))
    expect(value).toBe('\n```sql\nselect 1\n```\n')
    expect(value.slice(...selection)).toBe('select 1')
  })

  it('inserts a table without selecting', () => {
    const { value } = applyInsert('', 0, 0, table('Column'))
    expect(value).toContain('| Column | Column |')
  })
})
