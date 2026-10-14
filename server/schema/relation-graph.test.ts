import { describe, expect, it } from 'vitest'
import type { SchemaColumn, SchemaSnapshot, SchemaTable } from '#shared/types/db'
import { buildRelationGraph, camel, inferDisplayColumn, isUnique } from './relation-graph'
import { validateVirtualRelation } from './virtual-relations'

function col(name: string, kind: SchemaColumn['kind'] = 'number', extra: Partial<SchemaColumn> = {}): SchemaColumn {
  return {
    name,
    nativeType: kind,
    kind,
    nullable: false,
    default: null,
    isGenerated: false,
    isPrimaryKey: false,
    comment: null,
    enumValues: null,
    ...extra,
  }
}

function table(name: string, columns: SchemaColumn[], extra: Partial<SchemaTable> = {}): SchemaTable {
  const pk = columns.filter((c) => c.isPrimaryKey).map((c) => c.name)
  return {
    name,
    kind: 'table',
    columns,
    primaryKey: pk,
    foreignKeys: [],
    indexes: pk.length ? [{ name: `${name}_pkey`, columns: pk, unique: true, primary: true }] : [],
    implicitRowid: false,
    rowEstimate: null,
    comment: null,
    ...extra,
  }
}

const id = (name = 'id') => col(name, 'number', { isPrimaryKey: true })
const fk = (name: string, columns: string[], refTable: string, refColumns: string[] = ['id']) => ({
  name,
  columns,
  refSchema: 'public',
  refTable,
  refColumns,
  onDelete: 'cascade' as const,
  onUpdate: 'no action' as const,
})

function snapshot(tables: SchemaTable[]): SchemaSnapshot {
  return { dialect: 'postgres', schema: 'public', tables, readAt: '2026-01-01T00:00:00.000Z' }
}

describe('buildRelationGraph', () => {
  it('turns an FK into many-to-one on the FK side and one-to-many on the target', () => {
    const users = table('users', [id()])
    const orders = table('orders', [id(), col('user_id')], { foreignKeys: [fk('orders_user_fk', ['user_id'], 'users')] })
    const graph = buildRelationGraph(snapshot([users, orders]))

    expect(graph.tables.orders!.outgoing).toEqual([
      expect.objectContaining({ name: 'orders.user', target: 'users', cardinality: 'many-to-one', columns: ['user_id'], targetColumns: ['id'], virtual: false }),
    ])
    expect(graph.tables.users!.incoming).toEqual([
      expect.objectContaining({ name: 'users.orders', target: 'orders', cardinality: 'one-to-many' }),
    ])
    expect(graph.relations).toHaveLength(1)
    expect(graph.relations[0]).toMatchObject({ id: 'fk:orders:orders_user_fk', onDelete: 'cascade', selfReference: false })
  })

  it('detects one-to-one when the FK columns are unique (PK or unique index)', () => {
    const users = table('users', [id()])
    const profiles = table('profiles', [col('user_id', 'number', { isPrimaryKey: true }), col('bio', 'string')], {
      foreignKeys: [fk('profiles_user_fk', ['user_id'], 'users')],
    })
    const graph = buildRelationGraph(snapshot([users, profiles]))
    expect(graph.tables.profiles!.outgoing[0]!.cardinality).toBe('one-to-one')
    expect(graph.tables.users!.incoming[0]!.cardinality).toBe('one-to-one')
  })

  it('builds a many-to-many through a junction whose PK is covered by its two FKs', () => {
    const products = table('products', [id(), col('name', 'string')])
    const tags = table('tags', [id(), col('label', 'string')])
    const productTags = table(
      'product_tags',
      [col('product_id', 'number', { isPrimaryKey: true }), col('tag_id', 'number', { isPrimaryKey: true })],
      { foreignKeys: [fk('pt_p', ['product_id'], 'products'), fk('pt_t', ['tag_id'], 'tags')] },
    )
    const graph = buildRelationGraph(snapshot([products, tags, productTags]))

    const m2m = graph.relations.find((r) => r.cardinality === 'many-to-many')!
    expect(m2m).toMatchObject({
      name: 'products.tags',
      inverseName: 'tags.products',
      via: { table: 'product_tags', fromColumns: ['product_id'], toColumns: ['tag_id'] },
    })
    expect(graph.tables.products!.outgoing.map((r) => r.name)).toContain('products.tags')
    expect(graph.tables.tags!.outgoing.map((r) => r.name)).toContain('tags.products')
  })

  it('recognises a junction with only FKs and timestamps', () => {
    const a = table('authors', [id()])
    const b = table('books', [id()])
    const junction = table('book_authors', [
      col('author_id'),
      col('book_id'),
      col('created_at', 'datetime'),
    ], { foreignKeys: [fk('ba_a', ['author_id'], 'authors'), fk('ba_b', ['book_id'], 'books')] })
    const graph = buildRelationGraph(snapshot([a, b, junction]))
    expect(graph.relations.some((r) => r.cardinality === 'many-to-many')).toBe(true)
  })

  it('handles a self reference with both directions on the same table', () => {
    const categories = table('categories', [id(), col('parent_id')], {
      foreignKeys: [fk('cat_parent', ['parent_id'], 'categories')],
    })
    const graph = buildRelationGraph(snapshot([categories]))
    const [rel] = graph.relations
    expect(rel).toMatchObject({ selfReference: true, name: 'categories.parent' })
    expect(rel!.inverseName).toBe('categories.categoriesByParent')
    expect(graph.tables.categories!.outgoing[0]!.target).toBe('categories')
    expect(graph.tables.categories!.incoming[0]!.target).toBe('categories')
  })

  it('keeps composite FKs whole on both sides', () => {
    const shipments = table('shipments', [col('order_id', 'number', { isPrimaryKey: true }), col('shipment_no', 'number', { isPrimaryKey: true })])
    const items = table('order_items', [id(), col('order_id'), col('shipment_no')], {
      foreignKeys: [fk('oi_s', ['order_id', 'shipment_no'], 'shipments', ['order_id', 'shipment_no'])],
    })
    const graph = buildRelationGraph(snapshot([shipments, items]))
    expect(graph.tables.order_items!.outgoing[0]).toMatchObject({
      columns: ['order_id', 'shipment_no'],
      targetColumns: ['order_id', 'shipment_no'],
    })
  })

  it('disambiguates two FKs from the same table to the same target by column name', () => {
    const addresses = table('addresses', [id()])
    const orders = table('orders', [id(), col('billing_address_id'), col('shipping_address_id')], {
      foreignKeys: [
        fk('o_billing', ['billing_address_id'], 'addresses'),
        fk('o_shipping', ['shipping_address_id'], 'addresses'),
      ],
    })
    const graph = buildRelationGraph(snapshot([addresses, orders]))
    const names = graph.tables.orders!.outgoing.map((r) => r.name)
    expect(names).toEqual(['orders.billingAddress', 'orders.shippingAddress'])
    expect(graph.tables.addresses!.incoming.map((r) => r.name)).toEqual([
      'addresses.ordersByBillingAddress',
      'addresses.ordersByShippingAddress',
    ])
  })

  it('resolves FKs without target columns to the parent primary key', () => {
    const users = table('users', [id('uid')])
    const orders = table('orders', [id(), col('user_id')], {
      foreignKeys: [fk('o_u', ['user_id'], 'users', [])],
    })
    const graph = buildRelationGraph(snapshot([users, orders]))
    expect(graph.relations[0]!.to.columns).toEqual(['uid'])
  })

  it('merges virtual relations as relations with virtual: true, in both directions', () => {
    const users = table('users', [id()])
    const logs = table('audit_logs', [id(), col('entity_id')])
    const graph = buildRelationGraph(snapshot([users, logs]), [
      {
        id: 'v1',
        name: null,
        fromTable: 'audit_logs',
        fromColumns: ['entity_id'],
        toTable: 'users',
        toColumns: ['id'],
        cardinality: 'many-to-one',
      },
    ])
    expect(graph.tables.audit_logs!.outgoing[0]).toMatchObject({ name: 'audit_logs.entity', virtual: true, target: 'users' })
    expect(graph.tables.users!.incoming[0]).toMatchObject({ name: 'users.auditLogs', virtual: true })
    expect(graph.relations[0]).toMatchObject({ id: 'v1', virtual: true, onDelete: null })
  })

  it('applies display column overrides over the inferred one', () => {
    const users = table('users', [id(), col('name', 'string'), col('email', 'string')])
    const graph = buildRelationGraph(snapshot([users]), [], { displayOverrides: { users: 'email' } })
    expect(graph.tables.users!.displayColumn).toBe('email')
  })

  it('is deterministic for the same input', () => {
    const users = table('users', [id()])
    const orders = table('orders', [id(), col('user_id')], { foreignKeys: [fk('o_u', ['user_id'], 'users')] })
    const snap = snapshot([users, orders])
    expect(buildRelationGraph(snap)).toEqual(buildRelationGraph(snap))
  })

  it('ignores views as endpoints', () => {
    const users = table('users', [id()])
    const view = table('v_users', [col('id')], { kind: 'view', primaryKey: [] })
    const graph = buildRelationGraph(snapshot([users, view]))
    expect(graph.relations).toEqual([])
    expect(graph.tables.v_users).toBeDefined()
  })
})

describe('helpers', () => {
  it('infers the display column by name, then the first text column', () => {
    expect(inferDisplayColumn(table('t', [id(), col('title', 'string'), col('name', 'string')]))).toBe('name')
    expect(inferDisplayColumn(table('t', [id(), col('payload', 'string')]))).toBe('payload')
    expect(inferDisplayColumn(table('t', [id()]))).toBeNull()
  })

  it('treats a PK or unique index as uniqueness, regardless of order', () => {
    const t = table('t', [col('a', 'number', { isPrimaryKey: true }), col('b', 'number', { isPrimaryKey: true })])
    expect(isUnique(t, ['b', 'a'])).toBe(true)
    expect(isUnique(t, ['a'])).toBe(false)
  })

  it('camel-cases names', () => {
    expect(camel('billing_address')).toBe('billingAddress')
    expect(camel('Orders')).toBe('orders')
  })
})

describe('validateVirtualRelation', () => {
  const snap = snapshot([
    table('users', [id(), col('email', 'string')]),
    table('audit_logs', [id(), col('entity_id'), col('actor', 'string')]),
  ])
  const base = {
    schema: 'public',
    name: null,
    fromTable: 'audit_logs',
    fromColumns: ['entity_id'],
    toTable: 'users',
    toColumns: ['id'],
    cardinality: 'many-to-one' as const,
  }

  it('accepts a relation between existing columns of compatible types', () => {
    expect(validateVirtualRelation(snap, base)).toEqual([])
  })

  it('rejects a column that does not exist', () => {
    const issues = validateVirtualRelation(snap, { ...base, fromColumns: ['missing'] })
    expect(issues).toEqual([{ code: 'column-not-found', params: { table: 'audit_logs', column: 'missing' } }])
  })

  it('rejects a table that does not exist', () => {
    expect(validateVirtualRelation(snap, { ...base, toTable: 'nope' })).toEqual([
      { code: 'table-not-found', params: { table: 'nope' } },
    ])
  })

  it('rejects incompatible column kinds', () => {
    const issues = validateVirtualRelation(snap, { ...base, fromColumns: ['actor'] })
    expect(issues).toEqual([
      { code: 'incompatible-kinds', params: { from: 'audit_logs.actor', to: 'users.id' } },
    ])
  })

  it('rejects a relation that duplicates an existing FK or virtual relation', () => {
    const withFk = snapshot([
      table('users', [id(), col('email', 'string')]),
      table('orders', [id(), col('user_id')], { foreignKeys: [fk('o_u', ['user_id'], 'users')] }),
    ])
    const dup = validateVirtualRelation(withFk, {
      ...base,
      fromTable: 'orders',
      fromColumns: ['user_id'],
      toTable: 'users',
      toColumns: ['id'],
    })
    expect(dup).toEqual([{ code: 'duplicate', params: {} }])
  })

  it('ignores the relation being edited when checking duplicates', () => {
    const existing = [
      { id: 'v1', name: null, fromTable: 'audit_logs', fromColumns: ['entity_id'], toTable: 'users', toColumns: ['id'], cardinality: 'many-to-one' as const },
    ]
    expect(validateVirtualRelation(snap, base, existing, 'v1')).toEqual([])
    expect(validateVirtualRelation(snap, base, existing)).toEqual([{ code: 'duplicate', params: {} }])
  })
})
