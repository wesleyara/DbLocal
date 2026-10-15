import { describe, expect, it } from 'vitest'
import { recordAsInsert } from './record-sql'

describe('recordAsInsert', () => {
  const row = { id: 1, name: "O'Hara", active: true, note: null, meta: { a: 1 } }

  it('quotes identifiers and escapes strings for Postgres', () => {
    expect(recordAsInsert('postgres', 'public', 'users', row)).toBe(
      `INSERT INTO "public"."users" ("id", "name", "active", "note", "meta") VALUES (1, 'O''Hara', TRUE, NULL, '{"a":1}');`,
    )
  })

  it('uses backticks for MySQL and no schema prefix for SQLite', () => {
    expect(recordAsInsert('mysql', 'shop', 'users', { id: 1, path: 'a\\b' })).toBe(
      "INSERT INTO `shop`.`users` (`id`, `path`) VALUES (1, 'a\\\\b');",
    )
    expect(recordAsInsert('sqlite', 'main', 'users', { id: 1, ok: false })).toBe(
      `INSERT INTO "users" ("id", "ok") VALUES (1, 0);`,
    )
  })

  it('skips generated columns and nulls out binary previews', () => {
    expect(recordAsInsert('postgres', 'public', 't', { id: 1, b: { $binary: 'AA==', size: 1, truncated: false } }, ['id'])).toBe(
      `INSERT INTO "public"."t" ("b") VALUES (NULL);`,
    )
  })
})
