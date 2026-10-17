import { describe, expect, it } from 'vitest'
import { buildErd, cardinalityShort, spreadLabels, clampNoteWidth, edgeSides, markerPath, neighbourhood, noteHeight, noteLines, noteWidth, parseHandle, handleId, usablePositions } from './erd'
import type { RelationGraph, SchemaSnapshot, SchemaTable } from './types/db'

const col = (name: string, pk = false) => ({
  name, nativeType: 'int', kind: 'number' as const, nullable: false, default: null, isGenerated: false, isPrimaryKey: pk, comment: null, enumValues: null,
})
const table = (name: string, columns: string[], fks: SchemaTable['foreignKeys'] = []): SchemaTable => ({
  name, kind: 'table', columns: columns.map((c, i) => col(c, i === 0)), primaryKey: [columns[0]!], foreignKeys: fks, indexes: [],
  implicitRowid: false, rowEstimate: null, comment: null,
})
const snapshot: SchemaSnapshot = {
  dialect: 'sqlite', schema: 'main', readAt: '',
  tables: [
    table('users', ['id', 'name']),
    table('orders', ['id', 'user_id'], [{ name: 'fk', columns: ['user_id'], refSchema: null, refTable: 'users', refColumns: ['id'], onDelete: 'no action', onUpdate: 'no action' }]),
    table('items', ['id', 'order_id']),
  ],
}
const graph = {
  tables: {},
  relations: [
    { id: 'r1', name: 'orders.user', inverseName: 'users.orders', cardinality: 'many-to-one', from: { table: 'orders', columns: ['user_id'] }, to: { table: 'users', columns: ['id'] }, via: null, virtual: false, onDelete: null, selfReference: false },
    { id: 'r2', name: 'items.order', inverseName: 'orders.items', cardinality: 'many-to-one', from: { table: 'items', columns: ['order_id'] }, to: { table: 'orders', columns: ['id'] }, via: null, virtual: true, onDelete: null, selfReference: false },
    { id: 'r3', name: 'users.items', inverseName: 'items.users', cardinality: 'many-to-many', from: { table: 'users', columns: ['id'] }, to: { table: 'items', columns: ['id'] }, via: { table: 'orders', fromColumns: [], toColumns: [] }, virtual: false, onDelete: null, selfReference: false },
  ],
} as unknown as RelationGraph

describe('buildErd', () => {
  const erd = buildErd(snapshot, graph)
  it('draws one edge per FK column and skips N:N', () => {
    expect(erd.edges.map((e) => e.id)).toEqual(['r1#0', 'r2#0'])
    expect(erd.edges[0]).toMatchObject({ source: 'orders', target: 'users', sourceEnd: 'many', targetEnd: 'one', virtual: false })
    expect(erd.edges[1]!.virtual).toBe(true)
  })
  it('flags key columns', () => {
    const orders = erd.tables.find((t) => t.id === 'orders')!
    expect(orders.columns.map((c) => [c.name, c.pk, c.fk])).toEqual([['id', true, false], ['user_id', false, true]])
  })
  it('carries unique, default and reference info', () => {
    const t = table('accounts', ['id', 'email', 'org_id', 'role'], [{ name: 'fk', columns: ['org_id'], refSchema: null, refTable: 'orgs', refColumns: ['id'], onDelete: 'no action', onUpdate: 'no action' }])
    t.columns[1]!.default = null
    t.columns[3]!.default = "'member'"
    t.indexes = [
      { name: 'u_email', columns: ['email'], unique: true, primary: false },
      { name: 'u_org_role', columns: ['org_id', 'role'], unique: true, primary: false },
      { name: 'pk', columns: ['id'], unique: true, primary: true },
    ]
    const cols = buildErd({ ...snapshot, tables: [t] }, null).tables[0]!.columns
    expect(cols[0]).toMatchObject({ unique: false, uniqueWith: [] })
    expect(cols[1]).toMatchObject({ unique: true })
    expect(cols[2]).toMatchObject({ unique: false, uniqueWith: [['org_id', 'role']], references: 'orgs.id' })
    expect(cols[3]).toMatchObject({ default: "'member'" })
  })
  it('widens tables to fit long names and types', () => {
    const t = table('accounts', ['id', 'a_rather_long_column_name_here'])
    t.columns[1]!.nativeType = 'timestamp(3) without time zone'
    const out = buildErd({ ...snapshot, tables: [table('t', ['id']), t] }, null).tables
    expect(out[0]!.width).toBe(248)
    expect(out[1]!.width).toBeGreaterThan(400)
  })
  it('truncates huge tables keeping keys', () => {
    const wide = table('wide', ['id', ...Array.from({ length: 60 }, (_, i) => `c${i}`), 'ref'])
    const out = buildErd({ ...snapshot, tables: [wide] }, null)
    expect(out.tables[0]!.columns).toHaveLength(40)
    expect(out.tables[0]!.hiddenColumns).toBe(22)
  })
})

describe('neighbourhood', () => {
  const edges = [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }, { source: 'c', target: 'd' }]
  it('walks relations in both directions', () => {
    expect([...neighbourhood(edges, 'b', 1)].sort()).toEqual(['a', 'b', 'c'])
    expect([...neighbourhood(edges, 'a', 2)].sort()).toEqual(['a', 'b', 'c'])
    expect(neighbourhood(edges, 'a', 0).size).toBe(1)
  })
})

describe('geometry helpers', () => {
  it('picks sides', () => {
    expect(edgeSides(0, 100, 200, 100, false)).toEqual({ source: 'r', target: 'l' })
    expect(edgeSides(200, 100, 0, 100, false)).toEqual({ source: 'l', target: 'r' })
    expect(edgeSides(0, 100, 50, 100, false)).toEqual({ source: 'r', target: 'r' })
  })
  it('round-trips handle ids', () => {
    expect(parseHandle(handleId('a:b', 'l'))).toEqual({ column: 'a:b', side: 'l' })
    expect(parseHandle('x')).toBeNull()
  })
  it('draws markers', () => {
    expect(markerPath(0, 0, 1, 'many')).toContain('L0,-6')
    expect(markerPath(0, 0, -1, 'one')).toBe('M-8,-6 L-8,6')
  })
  it('labels cardinality from the FK side', () => {
    expect(cardinalityShort('many', 'one')).toBe('N:1')
    expect(cardinalityShort('one', 'one')).toBe('1:1')
    expect(cardinalityShort('one', 'many')).toBe('1:N')
  })
  it('wraps note text on words and keeps line breaks', () => {
    expect(noteLines('a\n\nb')).toEqual(['a', '', 'b'])
    const long = noteLines('word '.repeat(20).trim())
    expect(long.length).toBeGreaterThan(2)
    expect(long.every((l) => l.length <= 27 && !l.startsWith(' '))).toBe(true)
    expect(noteLines('x'.repeat(64))).toEqual(['x'.repeat(27), 'x'.repeat(27), 'x'.repeat(10)])
    expect(noteHeight('a\nb')).toBe(52)
  })
  it('wraps wider notes on longer lines and clamps the width', () => {
    expect(noteLines('x'.repeat(64), 520)).toEqual(['x'.repeat(64)])
    expect(noteWidth({})).toBe(240)
    expect(noteWidth({ width: 5000 })).toBe(800)
    expect(clampNoteWidth(10)).toBe(160)
  })
  it('drops stale positions', () => {
    expect(usablePositions({ a: { x: 1, y: 2 }, gone: { x: 0, y: 0 }, b: { x: NaN, y: 0 } }, ['a', 'b'])).toEqual({ a: { x: 1, y: 2 } })
  })
})

describe('buildErdSvg', () => {
  it('draws tables and edges, dashed for virtual', async () => {
    const { buildErdSvg } = await import('./erd-svg')
    const erd = buildErd(snapshot, graph)
    const colors = { bg: '#fff', surface: '#eee', header: '#ddd', border: '#ccc', fg: '#000', muted: '#555', subtle: '#777', accent: '#00f', warning: '#fa0', note: '#ffe' }
    const out = buildErdSvg(erd.tables, erd.edges, { users: { x: 0, y: 0 }, orders: { x: 400, y: 0 }, items: { x: 800, y: 0 } }, colors)
    expect(out.svg).toContain('>users<')
    expect(out.svg).toContain('stroke-dasharray')
    expect(out.width).toBeGreaterThan(1000)
    expect(out.svg).toContain('>N:1<')
    expect(buildErdSvg([], [], {}, colors).svg).toBe('')
    const withNote = buildErdSvg([], [], {}, colors, [{ id: 'n', x: 10, y: 10, text: 'check <this>' }])
    expect(withNote.svg).toContain('check &lt;this&gt;')
    expect(withNote.svg).not.toContain('>PK<')
    expect(buildErdSvg([], [], {}, colors, [{ id: 'n', x: 0, y: 0, text: 'a', width: 500 }]).svg).toContain('width="500"')
  })
})

describe('spreadLabels', () => {
  const chip = (id: string, x: number, y: number, y1 = y - 200, y2 = y + 200) => ({ id, x, y, width: 34, height: 18, y1, y2 })

  it('leaves chips that do not touch where they are', () => {
    const out = spreadLabels([chip('a', 0, 0), chip('b', 100, 0), chip('c', 0, 100)])
    expect([...out.values()]).toEqual([0, 0, 0])
  })

  it('moves overlapping chips apart along their line, and the result never overlaps', () => {
    const boxes = [chip('a', 10, 100), chip('b', 10, 104), chip('c', 12, 98)]
    const out = spreadLabels(boxes)
    const ys = boxes.map((b) => b.y + out.get(b.id)!).sort((p, q) => p - q)
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(18)
    expect(out.get('a')).toBe(0)
  })

  it('keeps a chip on its vertical leg when there is room', () => {
    // b's leg runs only downwards from 100: it must not be pushed above.
    const out = spreadLabels([chip('a', 0, 100), chip('b', 0, 100, 90, 160)])
    expect(out.get('b')).toBeGreaterThan(0)
  })

  it('is stable whatever the input order', () => {
    const boxes = [chip('a', 0, 0), chip('b', 0, 2), chip('c', 0, 4)]
    expect(spreadLabels(boxes)).toEqual(spreadLabels([...boxes].reverse()))
  })
})
