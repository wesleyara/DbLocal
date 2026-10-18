import { describe, expect, it } from 'vitest'
import { classifyStatement, splitStatements, statementAt, statementPrefix } from './sql-split'

const texts = (sql: string, d: Parameters<typeof splitStatements>[1] = 'postgres') =>
  splitStatements(sql, d).map((s) => s.sql)

describe('splitStatements', () => {
  it('splits on semicolons and drops empty statements', () => {
    expect(texts('select 1; select 2;;  ;\n select 3')).toEqual(['select 1', 'select 2', 'select 3'])
  })

  it('ignores semicolons in strings, identifiers and comments', () => {
    expect(texts(`select 'a;b', "c;d" from t; -- x; y\nselect /* ; */ 2`)).toEqual([
      `select 'a;b', "c;d" from t`,
      `-- x; y\nselect /* ; */ 2`,
    ])
  })

  it('handles doubled quotes', () => {
    expect(texts(`select 'it''s;'; select 2`)).toEqual([`select 'it''s;'`, 'select 2'])
  })

  it('keeps Postgres dollar-quoted bodies whole', () => {
    const fn = `create function f() returns int as $$ begin select 1; return 1; end $$ language plpgsql`
    expect(texts(`${fn}; select 2`)).toEqual([fn, 'select 2'])
    expect(texts(`do $body$ select ';' $body$; select 3`)).toEqual([`do $body$ select ';' $body$`, 'select 3'])
  })

  it('nests block comments in Postgres only', () => {
    expect(texts('select /* a /* b */ ; */ 1; select 2')).toEqual(['select /* a /* b */ ; */ 1', 'select 2'])
  })

  it('treats backslash escapes per dialect', () => {
    expect(texts(`select 'a\\';b'; select 2`, 'mysql')).toEqual([`select 'a\\';b'`, 'select 2'])
    expect(texts(`select E'a\\';b'; select 2`, 'postgres')).toEqual([`select E'a\\';b'`, 'select 2'])
  })

  it('supports MySQL # comments and SQLite bracket identifiers', () => {
    expect(texts('select 1; # a; b\nselect 2', 'mysql')).toEqual(['select 1', '# a; b\nselect 2'])
    expect(texts('select [a;b] from t; select 2', 'sqlite')).toEqual(['select [a;b] from t', 'select 2'])
  })

  it('keeps a trigger body in one statement', () => {
    const trg = `create trigger t after insert on a begin update b set x = 1; delete from c; end`
    expect(texts(`${trg}; select 1`, 'sqlite')).toEqual([trg, 'select 1'])
  })

  it('reports offsets', () => {
    const s = splitStatements('  select 1;\n  select 2', 'sqlite')
    expect(s[1]).toMatchObject({ sql: 'select 2', start: 14 })
    expect(statementAt(s, 5)?.sql).toBe('select 1')
    expect(statementAt(s, 16)?.sql).toBe('select 2')
  })
})

describe('classifyStatement', () => {
  const k = (sql: string, d: Parameters<typeof classifyStatement>[1] = 'postgres') => classifyStatement(sql, d)

  it('reads', () => {
    for (const sql of ['select 1', '  -- c\n (select 1)', 'show tables', 'values (1)', 'explain select 1']) {
      expect(k(sql)).toBe('read')
    }
  })

  it('writes', () => {
    for (const sql of ['insert into t values (1)', 'UPDATE t set a = 1', 'delete from t', 'replace into t values (1)']) {
      expect(k(sql)).toBe('write')
    }
  })

  it('ddl', () => {
    for (const sql of ['create table t (a int)', 'drop table t', 'alter table t add b int', 'truncate t']) {
      expect(k(sql)).toBe('ddl')
    }
  })

  it('looks into CTEs and EXPLAIN ANALYZE', () => {
    expect(k('with a as (select 1) select * from a')).toBe('read')
    expect(k('with a as (delete from t returning *) select * from a')).toBe('write')
    expect(k('explain analyze delete from t')).toBe('write')
    expect(k('explain analyze select 1')).toBe('read')
  })

  it('does not read keywords out of literals', () => {
    expect(k(`select 'delete from t' as s`)).toBe('read')
    expect(k(`with a as (select 'drop') select * from a`)).toBe('read')
  })

  it('handles pragma, select into and unknown statements', () => {
    expect(k('pragma table_info(t)', 'sqlite')).toBe('read')
    expect(k('pragma journal_mode = wal', 'sqlite')).toBe('write')
    expect(k('select * into t2 from t')).toBe('ddl')
    expect(k(`select 1 into outfile '/tmp/x'`, 'mysql')).toBe('other')
    expect(k('set search_path to x')).toBe('other')
    expect(k('begin')).toBe('other')
    expect(k('')).toBe('other')
  })
})

describe('statementPrefix', () => {
  it('returns the statement being typed up to the cursor', () => {
    expect(statementPrefix('select 1;\nselect * fr', 'postgres')).toBe('select * fr')
    expect(statementPrefix('select 1; ', 'postgres')).toBe('')
    expect(statementPrefix("select ';' from t ", 'postgres')).toBe("select ';' from t ")
    expect(statementPrefix('', 'postgres')).toBe('')
  })
})
