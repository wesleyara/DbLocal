import type { RelationGraph, SchemaSnapshot } from './types/db'

export const ERD_NODE_WIDTH = 248
export const ERD_HEADER_HEIGHT = 32
export const ERD_ROW_HEIGHT = 24
/** Tables with more columns than this show the first ones and a "+N more" row. */
export const ERD_MAX_COLUMNS = 40

export interface ErdColumn {
  name: string
  type: string
  pk: boolean
  fk: boolean
  nullable: boolean
}

export interface ErdTable {
  id: string
  kind: 'table' | 'view' | 'materialized_view'
  columns: ErdColumn[]
  /** Columns that did not fit (see `ERD_MAX_COLUMNS`). */
  hiddenColumns: number
}

/** `one` / `many` is the cardinality seen at that end of the line (crow's foot for `many`). */
export type EndCardinality = 'one' | 'many'

export interface ErdEdge {
  id: string
  source: string
  target: string
  sourceColumn: string
  targetColumn: string
  sourceEnd: EndCardinality
  targetEnd: EndCardinality
  virtual: boolean
  name: string
}

export interface ErdModel {
  tables: ErdTable[]
  edges: ErdEdge[]
}

export interface Point {
  x: number
  y: number
}

/** Tables and column-to-column edges of a schema. N:N relations are skipped: their junction already draws them. */
export function buildErd(snapshot: SchemaSnapshot, graph: RelationGraph | null): ErdModel {
  const fkColumns = new Map<string, Set<string>>()
  const mark = (table: string, columns: string[]) => {
    const set = fkColumns.get(table) ?? new Set<string>()
    for (const c of columns) set.add(c)
    fkColumns.set(table, set)
  }

  const edges: ErdEdge[] = []
  for (const r of graph?.relations ?? []) {
    if (r.via || r.cardinality === 'many-to-many') continue
    mark(r.from.table, r.from.columns)
    r.from.columns.forEach((column, i) => {
      const toColumn = r.to.columns[i] ?? r.to.columns[0]!
      edges.push({
        id: `${r.id}#${i}`,
        source: r.from.table,
        target: r.to.table,
        sourceColumn: column,
        targetColumn: toColumn,
        sourceEnd: r.cardinality === 'one-to-many' ? 'one' : r.cardinality === 'one-to-one' ? 'one' : 'many',
        targetEnd: r.cardinality === 'one-to-many' ? 'many' : 'one',
        virtual: r.virtual,
        name: r.name,
      })
    })
  }

  const names = new Set(snapshot.tables.map((t) => t.name))
  const tables: ErdTable[] = snapshot.tables.map((t) => {
    const fks = fkColumns.get(t.name)
    for (const fk of t.foreignKeys) for (const c of fk.columns) (fks ?? new Set<string>()).add(c)
    const cols = t.columns.map<ErdColumn>((c) => ({
      name: c.name,
      type: c.nativeType,
      pk: c.isPrimaryKey,
      fk: !!fks?.has(c.name) || t.foreignKeys.some((fk) => fk.columns.includes(c.name)),
      nullable: c.nullable,
    }))
    // Keys first, so the columns that matter stay visible when a table is truncated.
    const shown = cols.length > ERD_MAX_COLUMNS ? prioritise(cols, edges, t.name).slice(0, ERD_MAX_COLUMNS) : cols
    return { id: t.name, kind: t.kind, columns: shown, hiddenColumns: cols.length - shown.length }
  })

  return { tables, edges: edges.filter((e) => names.has(e.source) && names.has(e.target)) }
}

function prioritise(columns: ErdColumn[], edges: ErdEdge[], table: string): ErdColumn[] {
  const linked = new Set<string>()
  for (const e of edges) {
    if (e.source === table) linked.add(e.sourceColumn)
    if (e.target === table) linked.add(e.targetColumn)
  }
  const rank = (c: ErdColumn) => (c.pk ? 0 : c.fk || linked.has(c.name) ? 1 : 2)
  return columns
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map((x) => x.c)
}

export function tableHeight(table: Pick<ErdTable, 'columns' | 'hiddenColumns'>): number {
  return ERD_HEADER_HEIGHT + (table.columns.length + (table.hiddenColumns > 0 ? 1 : 0)) * ERD_ROW_HEIGHT
}

/** Tables within `hops` relations of `start` (either direction), `start` included. */
export function neighbourhood(edges: Pick<ErdEdge, 'source' | 'target'>[], start: string, hops: number): Set<string> {
  const adjacent = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    const set = adjacent.get(a) ?? new Set<string>()
    set.add(b)
    adjacent.set(a, set)
  }
  for (const e of edges) {
    link(e.source, e.target)
    link(e.target, e.source)
  }
  const seen = new Set([start])
  let frontier = [start]
  for (let depth = 0; depth < hops && frontier.length; depth++) {
    const next: string[] = []
    for (const t of frontier) {
      for (const n of adjacent.get(t) ?? []) {
        if (!seen.has(n)) {
          seen.add(n)
          next.push(n)
        }
      }
    }
    frontier = next
  }
  return seen
}

/** Tables directly linked to `table`, itself included. */
export const directNeighbours = (edges: Pick<ErdEdge, 'source' | 'target'>[], table: string): Set<string> =>
  neighbourhood(edges, table, 1)

/**
 * SVG path of a cardinality marker at `(x, y)`. `dir` is the way the line leaves the table
 * (`1` towards +x, `-1` towards -x). `many` is a crow's foot, `one` a bar.
 */
export function markerPath(x: number, y: number, dir: 1 | -1, end: EndCardinality): string {
  const d = dir * 10
  if (end === 'many') return `M${x + d},${y} L${x},${y - 6} M${x + d},${y} L${x},${y + 6} M${x + d},${y} L${x},${y}`
  const bar = dir * 8
  return `M${x + bar},${y - 6} L${x + bar},${y + 6}`
}

/** Which side of each node an edge uses, from the nodes' horizontal positions. */
export function edgeSides(sourceX: number, sourceWidth: number, targetX: number, targetWidth: number, self: boolean) {
  if (self) return { source: 'r' as const, target: 'r' as const }
  const sourceRight = sourceX + sourceWidth <= targetX
  const targetRight = targetX + targetWidth <= sourceX
  if (sourceRight) return { source: 'r' as const, target: 'l' as const }
  if (targetRight) return { source: 'l' as const, target: 'r' as const }
  // Overlapping columns: both on the right keeps the line out of the nodes.
  return { source: 'r' as const, target: 'r' as const }
}

/** Handle id of a column: `<column>:l` / `<column>:r`. The header uses the empty column. */
export const handleId = (column: string, side: 'l' | 'r'): string => `${column}:${side}`
export function parseHandle(id: string | null | undefined): { column: string; side: 'l' | 'r' } | null {
  if (!id) return null
  const at = id.lastIndexOf(':')
  const side = id.slice(at + 1)
  if (at === -1 || (side !== 'l' && side !== 'r')) return null
  return { column: id.slice(0, at), side }
}

/** Positions that still apply to tables of the current schema. */
export function usablePositions(saved: Record<string, Point>, tables: string[]): Record<string, Point> {
  const out: Record<string, Point> = {}
  for (const t of tables) {
    const p = saved[t]
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) out[t] = p
  }
  return out
}

/** Zoom below which tables collapse to their name. */
export const ERD_COMPACT_ZOOM = 0.5
