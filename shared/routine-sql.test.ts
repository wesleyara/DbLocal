import { describe, expect, it } from 'vitest'
import { createTemplate, dropSql, editScript, supportedKinds, toggleTriggerSql } from './routine-sql'
import type { DbRoutine, DbTrigger } from './types/routines'

const fn: DbRoutine = {
  name: 'add',
  kind: 'function',
  signature: 'add(integer, integer)',
  args: 'a integer, b integer',
  returns: 'integer',
  language: 'sql',
  comment: null,
  definition: 'CREATE OR REPLACE FUNCTION public.add(a integer, b integer) RETURNS integer AS $$ SELECT a + b $$ LANGUAGE sql',
}
const trg: DbTrigger = {
  name: 'touch',
  table: 'users',
  timing: 'BEFORE',
  events: ['UPDATE'],
  orientation: 'row',
  enabled: true,
  routine: 'touch_fn',
  definition: 'CREATE TRIGGER touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_fn()',
}

describe('routine sql', () => {
  it('drops with the dialect quoting', () => {
    expect(dropSql('postgres', 'public', fn)).toBe('DROP FUNCTION IF EXISTS "public"."add"(integer, integer);')
    expect(dropSql('postgres', 'public', trg)).toBe('DROP TRIGGER IF EXISTS "touch" ON "public"."users";')
    expect(dropSql('mysql', 'app', trg)).toBe('DROP TRIGGER IF EXISTS `app`.`touch`;')
    expect(dropSql('sqlite', 'main', trg)).toBe('DROP TRIGGER IF EXISTS "main"."touch";')
  })

  it('replaces Postgres functions in place and recreates the rest', () => {
    expect(editScript('postgres', 'public', fn, 'CREATE OR REPLACE FUNCTION x()')).toBe('CREATE OR REPLACE FUNCTION x();')
    expect(editScript('postgres', 'public', trg, trg.definition)).toBe(
      `BEGIN;\nDROP TRIGGER IF EXISTS "touch" ON "public"."users";\n${trg.definition};\nCOMMIT;`,
    )
    expect(editScript('mysql', 'app', trg, 'CREATE TRIGGER t ...;')).toBe(
      'DROP TRIGGER IF EXISTS `app`.`touch`;\nCREATE TRIGGER t ...;',
    )
    expect(editScript('sqlite', 'main', trg, 'x')).toMatch(/^BEGIN;/)
  })

  it('toggles and templates', () => {
    expect(toggleTriggerSql('public', trg, false)).toBe('ALTER TABLE "public"."users" DISABLE TRIGGER "touch";')
    expect(supportedKinds('sqlite')).toEqual(['trigger'])
    expect(createTemplate('postgres', 'public', 'trigger', 'users')).toContain('ON "public"."users"')
    expect(createTemplate('mysql', 'app', 'function')).toContain('CREATE FUNCTION')
  })
})
