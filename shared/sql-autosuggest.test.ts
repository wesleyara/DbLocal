import { describe, expect, it } from 'vitest'
import { autosuggest, completeFrom } from './sql-autosuggest'

describe('completeFrom', () => {
  it('ignores case and matches any whitespace run', () => {
    expect(completeFrom('SELECT  *', 'select *\nfrom users')).toBe('\nfrom users')
    expect(completeFrom('select ', 'select\n  id from t')).toBe('id from t')
    expect(completeFrom('select x', 'select * from t')).toBeNull()
    expect(completeFrom('select *', 'select *')).toBeNull()
  })
})

describe('autosuggest', () => {
  const history = ['select * from orders where id = 1', 'select * from users', 'update users set name = 1']

  it('takes the newest entry that starts with what was typed', () => {
    expect(autosuggest('select * from ', history)).toBe('orders where id = 1')
    expect(autosuggest('select * from u', history)).toBe('sers')
    expect(autosuggest('  upd', history)).toBe('ate users set name = 1')
  })

  it('needs a couple of characters and a real continuation', () => {
    expect(autosuggest('s', history)).toBeNull()
    expect(autosuggest('delete', history)).toBeNull()
    expect(autosuggest('select * from users', history)).toBeNull()
  })
})
