import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRelationGraph } from '../../schema/relation-graph'
import { parseEnumValues, referentialAction, type QueryFn } from './common'
import { mysqlKind } from './mysql'
import { pgKind } from './postgres'
import { introspectSqlite, sqliteKind } from './sqlite'

const SEED = fileURLToPath(new URL('../../../fixtures/seed/sqlite.sql', import.meta.url))

function sqliteQuery(db: Database.Database): QueryFn {
  return async <R>(sql: string) => db.prepare(sql).all() as R[]
}

describe('SQLite introspection (against the dev seed)', () => {
  const db = new Database(':memory:')
  db.exec(readFileSync(SEED, 'utf8'))

  it('reads the tables and the view of the seed', async () => {
    const snap = await introspectSqlite(sqliteQuery(db), 'main')
    const names = snap.tables.map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['users', 'profiles', 'categories', 'products', 'product_tags', 'orders', 'shipments', 'order_items']))
    expect(snap.tables.find((t) => t.name === 'order_summaries')?.kind).toBe('view')
  })

  it('normalises column kinds and nullability', async () => {
    const snap = await introspectSqlite(sqliteQuery(db), 'main')
    const users = snap.tables.find((t) => t.name === 'users')!
    expect(users.primaryKey).toEqual(['id'])
    expect(users.columns.find((c) => c.name === 'email')).toMatchObject({ kind: 'string', nullable: false, isPrimaryKey: false })
    expect(users.columns.find((c) => c.name === 'is_active')!.kind).toBe('boolean')
    expect(users.columns.find((c) => c.name === 'created_at')!.kind).toBe('datetime')
    expect(users.columns.find((c) => c.name === 'metadata')!.kind).toBe('json')
    expect(snap.tables.find((t) => t.name === 'profiles')!.columns.find((c) => c.name === 'avatar')!.kind).toBe('binary')
  })

  it('reads foreign keys, including the composite one, and resolves implicit targets', async () => {
    const snap = await introspectSqlite(sqliteQuery(db), 'main')
    const items = snap.tables.find((t) => t.name === 'order_items')!
    const composite = items.foreignKeys.find((f) => f.columns.length === 2)!
    expect(composite).toMatchObject({ columns: ['order_id', 'shipment_no'], refTable: 'shipments', refColumns: ['order_id', 'shipment_no'] })

    const categories = snap.tables.find((t) => t.name === 'categories')!
    expect(categories.foreignKeys[0]).toMatchObject({ columns: ['parent_id'], refTable: 'categories', refColumns: ['id'] })
  })

  it('feeds the relation graph: profiles is 1:1, product_tags is N:N, categories self-references', async () => {
    const snap = await introspectSqlite(sqliteQuery(db), 'main')
    const graph = buildRelationGraph(snap)
    expect(graph.tables.profiles!.outgoing[0]!.cardinality).toBe('one-to-one')
    expect(graph.relations.find((r) => r.cardinality === 'many-to-many')).toMatchObject({
      name: 'products.tags',
      via: { table: 'product_tags' },
    })
    expect(graph.relations.find((r) => r.selfReference)!.from.table).toBe('categories')
  })
})

describe('kind mapping', () => {
  it('maps SQLite declared types by affinity and common names', () => {
    expect(sqliteKind('INTEGER')).toBe('number')
    expect(sqliteKind('VARCHAR(40)')).toBe('string')
    expect(sqliteKind('DECIMAL(10,2)')).toBe('number')
    expect(sqliteKind('BOOLEAN')).toBe('boolean')
    expect(sqliteKind('DATETIME')).toBe('datetime')
    expect(sqliteKind('DATE')).toBe('date')
    expect(sqliteKind('')).toBe('other')
  })

  it('maps MySQL types, treating tinyint(1) as boolean', () => {
    expect(mysqlKind('tinyint', 'tinyint(1)')).toBe('boolean')
    expect(mysqlKind('tinyint', 'tinyint(4)')).toBe('number')
    expect(mysqlKind('varchar', 'varchar(255)')).toBe('string')
    expect(mysqlKind('enum', "enum('a','b')")).toBe('enum')
    expect(mysqlKind('json', 'json')).toBe('json')
  })

  it('maps Postgres types, arrays and enums', () => {
    expect(pgKind({ base_name: 'int8', base_type: 'b', is_array: false })).toBe('number')
    expect(pgKind({ base_name: 'timestamptz', base_type: 'b', is_array: false })).toBe('datetime')
    expect(pgKind({ base_name: 'int4', base_type: 'b', is_array: true })).toBe('array')
    expect(pgKind({ base_name: 'order_status', base_type: 'e', is_array: false })).toBe('enum')
    expect(pgKind({ base_name: 'uuid', base_type: 'b', is_array: false })).toBe('uuid')
  })
})

describe('helpers', () => {
  it('parses MySQL enum values, including escaped quotes', () => {
    expect(parseEnumValues("enum('small','big','it''s')")).toEqual(['small', 'big', "it's"])
    expect(parseEnumValues('varchar(10)')).toBeNull()
  })

  it('normalises referential action keywords', () => {
    expect(referentialAction('CASCADE')).toBe('cascade')
    expect(referentialAction('SET NULL')).toBe('set null')
    expect(referentialAction('NO ACTION')).toBe('no action')
    expect(referentialAction(undefined)).toBe('no action')
  })
})
