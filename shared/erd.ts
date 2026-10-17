import type { RelationGraph, SchemaSnapshot, SchemaTable } from './types/db'

/** Narrowest and widest a table gets; wider content is cut with an ellipsis. */
export const ERD_MIN_WIDTH = 248
export const ERD_MAX_WIDTH = 760
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
  /** Has a single-column unique index of its own (the PK is not counted). */
  unique: boolean
  /** Composite unique indexes the column takes part in, as column lists. */
  uniqueWith: string[][]
  default: string | null
  generated: boolean
  /** `table.column` a foreign key on this column points at. */
  references: string | null
}

export interface ErdTable {
  id: string
  kind: 'table' | 'view' | 'materialized_view'
  /** Width that fits the longest name and type, so nothing is truncated (within the limits). */
  width: number
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
    const uniques = t.indexes.filter((i) => i.unique && !i.primary)
    const cols = t.columns.map<ErdColumn>((c) => ({
      name: c.name,
      type: c.nativeType,
      pk: c.isPrimaryKey,
      fk: !!fks?.has(c.name) || t.foreignKeys.some((fk) => fk.columns.includes(c.name)),
      nullable: c.nullable,
      unique: uniques.some((i) => i.columns.length === 1 && i.columns[0] === c.name),
      uniqueWith: uniques.filter((i) => i.columns.length > 1 && i.columns.includes(c.name)).map((i) => i.columns),
      default: c.default,
      generated: c.isGenerated,
      references: referenceOf(t, c.name),
    }))
    // Keys first, so the columns that matter stay visible when a table is truncated.
    const shown = cols.length > ERD_MAX_COLUMNS ? prioritise(cols, edges, t.name).slice(0, ERD_MAX_COLUMNS) : cols
    return { id: t.name, kind: t.kind, width: tableWidth(t.name, shown), columns: shown, hiddenColumns: cols.length - shown.length }
  })

  return { tables, edges: edges.filter((e) => names.has(e.source) && names.has(e.target)) }
}

/** Approximate widths of the monospace text (12px names, 10px types) plus icon, markers and padding. */
export function tableWidth(name: string, columns: ErdColumn[]): number {
  let widest = 40 + name.length * 7.8
  for (const c of columns) {
    const markers = (c.nullable && !c.pk ? 12 : 0) + (c.unique || c.uniqueWith.length ? 20 : 0) + (c.default !== null || c.generated ? 20 : 0)
    widest = Math.max(widest, 36 + c.name.length * 7.3 + markers + 28 + c.type.length * 6.1 + 12)
  }
  return Math.min(ERD_MAX_WIDTH, Math.max(ERD_MIN_WIDTH, Math.ceil(widest / 8) * 8))
}

function referenceOf(table: SchemaTable, column: string): string | null {
  const fk = table.foreignKeys.find((f) => f.columns.includes(column))
  if (!fk) return null
  const target = fk.refColumns[fk.columns.indexOf(column)]
  return target ? `${fk.refTable}.${target}` : fk.refTable
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

/** Short cardinality of an edge read from the FK side to the referenced side: `N:1`, `1:1`, `1:N`. */
export function cardinalityShort(sourceEnd: EndCardinality, targetEnd: EndCardinality): string {
  return `${sourceEnd === 'one' ? '1' : 'N'}:${targetEnd === 'one' ? '1' : 'N'}`
}

/** Width and height of a cardinality chip (11px monospace text plus padding). */
export const labelChipWidth = (label: string): number => label.length * 6.8 + 10
export const LABEL_CHIP_HEIGHT = 18

/** A cardinality chip where its edge would put it: centred on (`x`, `y`), on a vertical leg spanning `y1`..`y2`. */
export interface LabelBox {
  id: string
  x: number
  y: number
  width: number
  height: number
  y1: number
  y2: number
}

/**
 * Vertical shift per chip so no two overlap. Edges that share a channel put their chips at nearly
 * the same midpoint; each one in turn (left to right, top to bottom, so the result is stable) takes
 * the nearest free slot up or down its own line, staying on its vertical leg when the leg is long
 * enough. A chip with no free slot nearby stays where it was.
 */
export function spreadLabels(boxes: LabelBox[], gap = 3): Map<string, number> {
  const order = [...boxes].sort((a, b) => a.x - b.x || a.y - b.y || (a.id < b.id ? -1 : 1))
  const placed: { x: number; y: number; width: number; height: number }[] = []
  const offsets = new Map<string, number>()
  const free = (b: LabelBox, y: number) =>
    placed.every(
      (p) => Math.abs(p.x - b.x) * 2 >= p.width + b.width + gap * 2 || Math.abs(p.y - y) * 2 >= p.height + b.height + gap * 2,
    )
  for (const b of order) {
    const step = b.height + gap
    const lo = Math.min(b.y1, b.y2) + b.height / 2
    const hi = Math.max(b.y1, b.y2) - b.height / 2
    const candidates = [0]
    for (let i = 1; i <= 12; i++) candidates.push(i * step, -i * step)
    const onLine = candidates.find((dy) => b.y + dy >= lo && b.y + dy <= hi && free(b, b.y + dy))
    const dy = onLine ?? candidates.find((d) => free(b, b.y + d)) ?? 0
    offsets.set(b.id, dy)
    placed.push({ x: b.x, y: b.y + dy, width: b.width, height: b.height })
  }
  return offsets
}

/** A free comment placed on the diagram. */
export interface ErdNote {
  id: string
  x: number
  y: number
  text: string
  /** Set when the user widened or narrowed the note; `ERD_NOTE_WIDTH` otherwise. */
  width?: number
}

export const ERD_NOTE_WIDTH = 240
export const ERD_NOTE_MIN_WIDTH = 160
export const ERD_NOTE_MAX_WIDTH = 800
export const ERD_NOTE_MAX_LENGTH = 5000
const NOTE_LINE_HEIGHT = 16
const NOTE_PADDING = 10
/** Left edge of a note's text: the comment icon sits in the gutter before it. */
export const ERD_NOTE_TEXT_X = 30
export const clampNoteWidth = (width: number): number =>
  Math.round(Math.min(ERD_NOTE_MAX_WIDTH, Math.max(ERD_NOTE_MIN_WIDTH, width)))
export const noteWidth = (note: Pick<ErdNote, 'width'>): number => (note.width ? clampNoteWidth(note.width) : ERD_NOTE_WIDTH)

/** Lines of a note as drawn in the export: hard breaks kept, long lines wrapped on words. */
export function noteLines(text: string, width = ERD_NOTE_WIDTH): string[] {
  // Characters that fit on one line (12px monospace between the icon gutter and the right padding).
  const NOTE_LINE_CHARS = Math.max(1, Math.floor((width - ERD_NOTE_TEXT_X - NOTE_PADDING) / 7.3))
  const out: string[] = []
  for (const raw of text.split('\n')) {
    let line = ''
    for (const word of raw.split(/(\s+)/)) {
      if ((line + word).length <= NOTE_LINE_CHARS) {
        line += word
        continue
      }
      if (line.trim()) out.push(line.trimEnd())
      let rest = word.trimStart()
      while (rest.length > NOTE_LINE_CHARS) {
        out.push(rest.slice(0, NOTE_LINE_CHARS))
        rest = rest.slice(NOTE_LINE_CHARS)
      }
      line = rest
    }
    out.push(line.trimEnd())
  }
  return out
}

export const noteHeight = (text: string, width = ERD_NOTE_WIDTH): number =>
  noteLines(text, width).length * NOTE_LINE_HEIGHT + NOTE_PADDING * 2

/** Zoom below which tables collapse to their name. */
export const ERD_COMPACT_ZOOM = 0.5
