import type {
  Cardinality,
  Relation,
  RelationGraph,
  RelationRef,
  SchemaSnapshot,
  SchemaTable,
  VirtualRelationDef,
} from '#shared/types/db'

export interface GraphOptions {
  /** Per-table display column chosen by the user. Overrides the inferred one. */
  displayOverrides?: Record<string, string>
}

const DISPLAY_NAMES = ['name', 'title', 'label', 'email']
const TIMESTAMP_NAME = /^(created|updated)_?at$/i

/**
 * Builds the normalised relation graph from a schema snapshot plus the user's virtual relations.
 * Pure: the same input always gives the same graph, so the three dialects can be compared in tests.
 */
export function buildRelationGraph(
  snapshot: SchemaSnapshot,
  virtual: VirtualRelationDef[] = [],
  options: GraphOptions = {},
): RelationGraph {
  const tables = new Map(snapshot.tables.filter((t) => t.kind === 'table').map((t) => [t.name, t]))
  const drafts: Draft[] = [...physicalDrafts(snapshot.schema, tables), ...virtualDrafts(virtual, tables)]
  const pairCount = countPairs(drafts)

  const relations: Relation[] = drafts.map((d) => toRelation(d, tables, pairCount))
  const junctions = detectManyToMany(relations, tables)
  relations.push(...junctions)

  const graph: RelationGraph = { tables: {}, relations }
  for (const table of snapshot.tables) {
    graph.tables[table.name] = {
      displayColumn: options.displayOverrides?.[table.name] ?? inferDisplayColumn(table),
      outgoing: [],
      incoming: [],
    }
  }
  for (const r of relations) addRefs(graph, r)
  return graph
}

/** Name of the column shown for a row: `name`, `title`, `label`, `email`, then the first text column. */
export function inferDisplayColumn(table: SchemaTable): string | null {
  for (const candidate of DISPLAY_NAMES) {
    const hit = table.columns.find((c) => c.name.toLowerCase() === candidate)
    if (hit) return hit.name
  }
  return table.columns.find((c) => !c.isPrimaryKey && c.kind === 'string')?.name ?? null
}

/** Columns form a key (PK or unique index), regardless of order. Used to tell 1:1 from N:1. */
export function isUnique(table: SchemaTable, columns: string[]): boolean {
  const wanted = sortedKey(columns)
  if (table.primaryKey.length > 0 && sortedKey(table.primaryKey) === wanted) return true
  return table.indexes.some((i) => i.unique && !i.primary && sortedKey(i.columns) === wanted)
}

// ---------------------------------------------------------------------------------------------
// Drafts: a physical FK or a virtual relation, before naming and cardinality are decided.

interface Draft {
  id: string
  fromTable: string
  fromColumns: string[]
  toTable: string
  /** Empty when unknown; resolved to the target PK when the draft is turned into a relation. */
  toColumns: string[]
  onDelete: Relation['onDelete']
  virtual: boolean
  /** Explicit name given by the user (virtual relations only). */
  name: string | null
}

function physicalDrafts(schema: string, tables: Map<string, SchemaTable>): Draft[] {
  const out: Draft[] = []
  for (const table of tables.values()) {
    for (const fk of table.foreignKeys) {
      // Cross-schema FKs point outside this snapshot: not navigable from here.
      if (fk.refSchema && fk.refSchema !== schema) continue
      if (!tables.has(fk.refTable)) continue
      out.push({
        id: `fk:${table.name}:${fk.name}`,
        fromTable: table.name,
        fromColumns: fk.columns,
        toTable: fk.refTable,
        toColumns: fk.refColumns,
        onDelete: fk.onDelete,
        virtual: false,
        name: null,
      })
    }
  }
  return out
}

function virtualDrafts(defs: VirtualRelationDef[], tables: Map<string, SchemaTable>): Draft[] {
  const out: Draft[] = []
  for (const def of defs) {
    if (!tables.has(def.fromTable) || !tables.has(def.toTable)) continue
    out.push({
      id: def.id,
      fromTable: def.fromTable,
      fromColumns: def.fromColumns,
      toTable: def.toTable,
      toColumns: def.toColumns,
      onDelete: null,
      virtual: true,
      name: def.name,
    })
  }
  return out
}

/** How many relations join each unordered pair of tables, to disambiguate names. */
function countPairs(drafts: Draft[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const d of drafts) {
    const key = pairKey(d.fromTable, d.toTable)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function toRelation(d: Draft, tables: Map<string, SchemaTable>, pairCount: Map<string, number>): Relation {
  const from = tables.get(d.fromTable)!
  const to = tables.get(d.toTable)!
  const toColumns = d.toColumns.length > 0 ? d.toColumns : to.primaryKey
  const cardinality: Cardinality = isUnique(from, d.fromColumns) ? 'one-to-one' : 'many-to-one'
  const base = baseName(d.fromColumns, d.toTable)
  const ambiguous = (pairCount.get(pairKey(d.fromTable, d.toTable)) ?? 0) > 1 || d.fromTable === d.toTable
  const name = d.name ?? `${d.fromTable}.${camel(base)}`
  const inverseName = ambiguous
    ? `${d.toTable}.${camel(d.fromTable)}By${pascal(base)}`
    : `${d.toTable}.${camel(d.fromTable)}`
  return {
    id: d.id,
    name,
    inverseName,
    cardinality,
    from: { table: d.fromTable, columns: d.fromColumns },
    to: { table: d.toTable, columns: toColumns },
    via: null,
    virtual: d.virtual,
    onDelete: d.onDelete,
    selfReference: d.fromTable === d.toTable,
  }
}

// ---------------------------------------------------------------------------------------------
// N:N: a junction table with two outgoing many-to-one relations.

function detectManyToMany(relations: Relation[], tables: Map<string, SchemaTable>): Relation[] {
  const out: Relation[] = []
  for (const junction of tables.values()) {
    // Sorted by target so the orientation does not depend on the order the database lists FKs in.
    const outgoing = relations
      .filter((r) => r.from.table === junction.name && r.cardinality === 'many-to-one')
      .sort((x, y) => x.to.table.localeCompare(y.to.table))
    if (outgoing.length !== 2) continue
    const [a, b] = outgoing
    if (!isJunction(junction, [a!, b!])) continue

    const tableA = tables.get(a!.to.table)!
    const tableB = tables.get(b!.to.table)!
    const selfRef = tableA.name === tableB.name
    // Table names are usually plural already, so they are used as they are.
    const nameAB = selfRef
      ? `${tableA.name}.${camel(baseName(a!.from.columns, a!.to.table))}Via${pascal(junction.name)}`
      : `${tableA.name}.${camel(tableB.name)}`
    const nameBA = selfRef
      ? `${tableB.name}.${camel(baseName(b!.from.columns, b!.to.table))}Via${pascal(junction.name)}`
      : `${tableB.name}.${camel(tableA.name)}`
    out.push({
      id: `m2m:${junction.name}`,
      name: nameAB,
      inverseName: nameBA,
      cardinality: 'many-to-many',
      from: { table: tableA.name, columns: a!.to.columns },
      to: { table: tableB.name, columns: b!.to.columns },
      via: { table: junction.name, fromColumns: a!.from.columns, toColumns: b!.from.columns },
      virtual: a!.virtual || b!.virtual,
      onDelete: null,
      selfReference: selfRef,
    })
  }
  return out
}

/** Junction = the two FKs cover the PK, or every other column is a timestamp. */
function isJunction(table: SchemaTable, [a, b]: Relation[]): boolean {
  const fkColumns = new Set([...a!.from.columns, ...b!.from.columns])
  const coversPk = table.primaryKey.length > 0 && table.primaryKey.every((c) => fkColumns.has(c))
  const onlyTimestamps = table.columns
    .filter((c) => !fkColumns.has(c.name))
    .every((c) => c.kind === 'datetime' || TIMESTAMP_NAME.test(c.name))
  return coversPk || onlyTimestamps
}

// ---------------------------------------------------------------------------------------------

function addRefs(graph: RelationGraph, r: Relation): void {
  const base = { relationId: r.id, virtual: r.virtual }
  if (r.via) {
    // N:N is navigable from both tables, so each side gets an outgoing ref.
    graph.tables[r.from.table]!.outgoing.push({
      ...base,
      name: r.name,
      target: r.to.table,
      cardinality: 'many-to-many',
      columns: r.from.columns,
      targetColumns: r.to.columns,
      via: r.via.table,
    })
    graph.tables[r.to.table]!.outgoing.push({
      ...base,
      name: r.inverseName,
      target: r.from.table,
      cardinality: 'many-to-many',
      columns: r.to.columns,
      targetColumns: r.from.columns,
      via: r.via.table,
    })
    return
  }
  const outgoing: RelationRef = {
    ...base,
    name: r.name,
    target: r.to.table,
    cardinality: r.cardinality,
    columns: r.from.columns,
    targetColumns: r.to.columns,
    via: null,
  }
  const incoming: RelationRef = {
    ...base,
    name: r.inverseName,
    target: r.from.table,
    cardinality: invert(r.cardinality),
    columns: r.to.columns,
    targetColumns: r.from.columns,
    via: null,
  }
  graph.tables[r.from.table]!.outgoing.push(outgoing)
  graph.tables[r.to.table]!.incoming.push(incoming)
}

function invert(c: Cardinality): Cardinality {
  if (c === 'many-to-one') return 'one-to-many'
  if (c === 'one-to-many') return 'many-to-one'
  return c
}

// ---------------------------------------------------------------------------------------------
// Naming helpers

/** `user_id` -> `user`; composite or a bare `id` falls back to the target table name. */
function baseName(columns: string[], refTable: string): string {
  if (columns.length === 1) {
    const stripped = columns[0]!.replace(/(^|_)id$/i, '')
    if (stripped) return stripped
  }
  return refTable
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('\u0000')
}

function sortedKey(columns: string[]): string {
  return [...columns].sort().join('\u0000')
}

function words(s: string): string[] {
  return s.split(/[^A-Za-z0-9]+/).filter(Boolean)
}

export function camel(s: string): string {
  const [first = '', ...rest] = words(s)
  return first.toLowerCase() + rest.map(pascal).join('')
}

export function pascal(s: string): string {
  return words(s)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
}
