import { describe, expect, it } from 'vitest'
import { sourceTableOf } from './sql-source'

describe('sourceTableOf', () => {
  it('reads plain selects', () => {
    expect(sourceTableOf('SELECT * FROM Profile', 'postgres')).toEqual({ table: 'Profile', schema: null, star: true })
    expect(sourceTableOf("select * from \"Profile\" where id = 'a from b';", 'postgres')?.table).toBe('Profile')
    expect(sourceTableOf('select id, name from public.users u where u.id > 3 order by 1 limit 5', 'postgres')).toEqual({
      table: 'users',
      schema: 'public',
      star: false,
    })
    expect(sourceTableOf('select u.* from `users` as u', 'mysql')).toEqual({ table: 'users', schema: null, star: true })
  })
  it('refuses anything involved', () => {
    for (const sql of [
      'select * from a join b on a.id = b.a_id',
      'select * from a, b',
      'select count(*) from a group by x',
      'select * from (select 1) t',
      'with x as (select 1) select * from x',
      'select 1',
      'select * from a union select * from b',
      'update a set x = 1',
    ]) {
      expect(sourceTableOf(sql, 'postgres'), sql).toBeNull()
    }
  })
})
