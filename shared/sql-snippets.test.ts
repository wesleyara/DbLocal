import { describe, expect, it } from 'vitest'
import { escapeSnippet, singular, snippetContext, snippetPreview, snippetsFor } from './sql-snippets'
import type { SchemaSnapshot } from './types/db'

const col = (name: string, extra = {}) => ({ name, nativeType: 'integer', kind: 'number', nullable: false, default: null, isGenerated: false, isPrimaryKey: false, enumValues: null, ...extra })
const snapshot = (dialect: SchemaSnapshot['dialect'] = 'postgres') => ({
  dialect,
  schema: 'public',
  tables: [
    { name: 'users', kind: 'table', columns: [col('id', { isPrimaryKey: true, nativeType: 'uuid' }), col('email')] },
    { name: 'categories', kind: 'table', columns: [col('id', { isPrimaryKey: true, nativeType: 'bigint unsigned auto_increment' })] },
    { name: 'active_users', kind: 'view', columns: [col('id')] },
  ],
}) as unknown as SchemaSnapshot

const byId = (list: ReturnType<typeof snippetsFor>, id: string) => list.find((s) => s.id === id)!

describe('snippetContext', () => {
  it('tells statement starts, ALTER TABLE and CREATE TABLE bodies apart', () => {
    expect(snippetContext('', 'postgres')).toEqual({ kind: 'statement', typed: '' })
    expect(snippetContext('select 1;\ncreate ta', 'postgres')).toEqual({ kind: 'statement', typed: 'create ta' })
    expect(snippetContext('alter table public."users" ad', 'postgres')).toEqual({ kind: 'alter', table: 'users' })
    expect(snippetContext('create table t (\n  id int,\n  ', 'postgres')).toEqual({ kind: 'create-body' })
    expect(snippetContext('create table t (id numeric(10, ', 'postgres')).toEqual({ kind: 'none' })
    expect(snippetContext('select * from users where ', 'postgres')).toEqual({ kind: 'none' })
  })
})

describe('snippetsFor', () => {
  it('writes the id column in each dialect', () => {
    expect(byId(snippetsFor('', 'postgres', null), 'createTable').body).toContain('GENERATED ALWAYS AS IDENTITY')
    expect(byId(snippetsFor('', 'mysql', null), 'createTable').body).toContain('AUTO_INCREMENT')
    expect(byId(snippetsFor('', 'sqlite', null), 'createTable').body).toContain('PRIMARY KEY AUTOINCREMENT')
  })

  it('offers the real tables (not views) as choices', () => {
    const fk = byId(snippetsFor('', 'postgres', snapshot()), 'createTableFk')
    expect(fk.body).toContain('${3|users,categories|}')
    expect(fk.body).toContain('${5|cascade,set null,restrict,no action|}')
    expect(byId(snippetsFor('', 'postgres', null), 'dropTable').body).toBe('DROP TABLE IF EXISTS ${1:table};$0')
  })

  it('adds a SQLite foreign key as a column with REFERENCES', () => {
    expect(byId(snippetsFor('', 'sqlite', null), 'addForeignKey').body).toMatch(/^ALTER TABLE \$\{1:table\} ADD COLUMN .* REFERENCES/)
    expect(byId(snippetsFor('', 'postgres', null), 'addForeignKey').body).toContain('ADD CONSTRAINT fk_${1}_${2:column} FOREIGN KEY (${2})')
    expect(snippetsFor('', 'sqlite', null).some((s) => s.id === 'addUnique')).toBe(false)
  })

  it('keeps only the snippets the typed words start, replacing them', () => {
    const out = snippetsFor('create ta', 'postgres', null)
    expect(out.map((s) => s.label)).toEqual(['create table', 'create table with foreign key'])
    expect(out[0]!.replace).toBe(9)
  })

  it('fills the table after ALTER TABLE and offers its columns', () => {
    const out = snippetsFor('alter table users ', 'postgres', snapshot())
    expect(byId(out, 'dropColumn').body).toBe('DROP COLUMN ${2|id,email|};$0')
    expect(byId(out, 'addForeignKey').body).toMatch(/^ADD CONSTRAINT fk_users_/)
  })

  it('offers one fk per table inside CREATE TABLE, typed like its key', () => {
    const out = snippetsFor('create table orders (\n  ', 'mysql', snapshot('mysql'))
    const labels = out.map((s) => s.label)
    expect(labels).toContain('fk → users')
    expect(out.find((s) => s.label === 'fk → users')!.body).toMatch(/^\$\{1:user_id\} uuid NOT NULL REFERENCES users \(id\)/)
    expect(out.find((s) => s.label === 'fk → categories')!.body).toMatch(/^\$\{1:category_id\} bigint unsigned NOT NULL/)
    expect(labels).not.toContain('fk → active_users')
  })

  it('has a Postgres-only enum snippet', () => {
    expect(snippetsFor('', 'postgres', null).some((s) => s.id === 'createEnum')).toBe(true)
    expect(snippetsFor('', 'mysql', null).some((s) => s.id === 'createEnum')).toBe(false)
  })
})

describe('snippetPreview', () => {
  it('replaces placeholders, choices and mirrors with their defaults', () => {
    expect(snippetPreview('CREATE INDEX ${1|users,orders|}_${2:column}_idx ON ${1} (${2});$0')).toBe('CREATE INDEX users_column_idx ON users (column);')
    expect(snippetPreview(`x \${1:${escapeSnippet('a$b}')}} $1`)).toBe('x a$b} a$b}')
  })
})

describe('singular', () => {
  it('drops a plural ending', () => {
    expect(['users', 'categories', 'addresses', 'boxes', 'status', 'tag'].map(singular)).toEqual(['user', 'category', 'address', 'box', 'status', 'tag'])
  })
})
