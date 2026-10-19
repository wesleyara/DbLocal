import { describe, expect, it } from 'vitest'
import { assessScript, hasDanger } from './sql-risk'

const kinds = (sql: string, dialect: 'postgres' | 'mysql' | 'sqlite' = 'postgres') =>
  assessScript(sql, dialect).map((r) => [r.kind, r.level, r.target])

describe('sql risk', () => {
  it('flags drops, truncates and unfiltered writes', () => {
    expect(kinds('drop table if exists "public"."users"; truncate orders; delete from tags; update items set a = 1')).toEqual([
      ['drop', 'danger', 'public.users'],
      ['truncate', 'danger', 'orders'],
      ['deleteAll', 'danger', 'tags'],
      ['updateAll', 'danger', 'items'],
    ])
    expect(assessScript('DROP FUNCTION f(integer)', 'postgres')[0]).toMatchObject({ kind: 'drop', object: 'function', target: 'f' })
  })

  it('leaves filtered writes, reads and harmless alters alone', () => {
    expect(kinds("delete from tags where id = 1; update t set a = 'where' where id = 2; select 1; alter table t alter column a drop not null; alter table t alter column b drop default")).toEqual([])
    expect(kinds("update t set note = 'no where here'")).toEqual([['updateAll', 'danger', 't']])
  })

  it('flags dropped columns and constraints', () => {
    expect(kinds('ALTER TABLE users DROP COLUMN email', 'mysql')).toEqual([['alterDrop', 'danger', 'users']])
    expect(kinds('alter table "users" drop constraint users_email_key')).toEqual([['alterDrop', 'danger', 'users']])
  })

  it('treats a drop followed by the same create as a replace', () => {
    expect(kinds('BEGIN;\nDROP TRIGGER IF EXISTS "main"."t";\nCREATE TRIGGER t AFTER INSERT ON x BEGIN SELECT 1; END;\nCOMMIT;', 'sqlite')).toEqual([['recreate', 'warning', 'main.t']])
    expect(kinds('DROP TABLE `a`; CREATE TABLE `a` (id int)', 'mysql')).toEqual([['recreate', 'danger', 'a']])
  })

  it('recognises the SQLite structure rebuild', () => {
    const script = 'CREATE TABLE "users__dblocal_new" (id integer); INSERT INTO "users__dblocal_new" SELECT id FROM "users"; DROP TABLE "users"; ALTER TABLE "users__dblocal_new" RENAME TO "users"'
    expect(kinds(script, 'sqlite')).toEqual([['rebuild', 'warning', 'users']])
    expect(hasDanger(script, 'sqlite')).toBe(false)
    expect(hasDanger('-- cleanup\ndrop table x', 'sqlite')).toBe(true)
  })
})
