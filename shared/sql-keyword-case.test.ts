import { describe, expect, it } from 'vitest'
import { upperKeywords } from './sql-keyword-case'
import { summarizeStatements } from './sql-split'

describe('upperKeywords', () => {
  it('upper-cases keywords and leaves identifiers and literals alone', () => {
    const sql = `select "id", "name" from "public"."users" where lower("name") like lower($1) escape '!' order by "id" asc limit $2 offset $3`
    expect(upperKeywords(sql, 'postgres')).toBe(
      `SELECT "id", "name" FROM "public"."users" WHERE LOWER("name") LIKE LOWER($1) ESCAPE '!' ORDER BY "id" ASC LIMIT $2 OFFSET $3`,
    )
  })

  it('keeps keyword-like words inside strings, backticks and comments', () => {
    expect(upperKeywords("select `order` from t where a = 'select from' -- and or", 'mysql')).toBe(
      "SELECT `order` FROM t WHERE a = 'select from' -- and or",
    )
  })

  it('does not touch bare names that are not keywords', () => {
    expect(upperKeywords('select users.name from users', 'sqlite')).toBe('SELECT users.name FROM users')
  })
})

describe('summarizeStatements', () => {
  it('gives each statement its kind and leading keyword', () => {
    expect(summarizeStatements("-- note\nselect 1; update t set a = 1; drop table x; foo", 'postgres')).toEqual([
      { sql: '-- note\nselect 1', kind: 'read', verb: 'SELECT' },
      { sql: 'update t set a = 1', kind: 'write', verb: 'UPDATE' },
      { sql: 'drop table x', kind: 'ddl', verb: 'DROP' },
      { sql: 'foo', kind: 'other', verb: 'FOO' },
    ])
  })
})
