import {
  ERD_HEADER_HEIGHT,
  ERD_NOTE_TEXT_X,
  ERD_ROW_HEIGHT,
  LABEL_CHIP_HEIGHT,
  cardinalityShort,
  edgeSides,
  labelChipWidth,
  markerPath,
  noteHeight,
  noteLines,
  noteWidth,
  spreadLabels,
  wirePath,
  tableHeight,
  type ErdNote,
  type LabelBox,
  type ErdEdge,
  type ErdTable,
  type Point,
} from './erd'

export interface ErdSvgColors {
  bg: string
  surface: string
  header: string
  border: string
  fg: string
  muted: string
  subtle: string
  accent: string
  warning: string
  /** Fill of the comment notes. */
  note: string
}

export interface ErdSvg {
  svg: string
  width: number
  height: number
}

const PAD = 40
/** Approximate advance of JetBrains Mono: 0.6em. */
const charWidth = (fontSize: number) => fontSize * 0.6

/** Lucide icons (24×24 viewBox, stroke 2) the canvas uses, so the export looks the same. */
const ICONS = {
  key: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
  link: '<path d="M9 17H7A5 5 0 0 1 7 7h2m6 0h2a5 5 0 1 1 0 10h-2m-7-5h8"/>',
  table: '<path d="M3 9h18M9 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/>',
  view: '<path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  comment: '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2zM7 11h10M7 15h6M7 7h8"/>',
}

function icon(name: keyof typeof ICONS, x: number, y: number, size: number, color: string): string {
  const k = size / 24
  return `<g transform="translate(${x},${y}) scale(${k})" color="${color}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</g>`
}

/** The small `U` / `D` badge drawn after a column name (9px semibold, bordered). */
function badge(label: string, x: number, mid: number, stroke: string, strokeOpacity: number, fill: string): string {
  const w = charWidth(9) + 5
  return (
    `<rect x="${x}" y="${mid - 6}" width="${w}" height="12" rx="3" fill="none" stroke="${stroke}" stroke-opacity="${strokeOpacity}"/>` +
    `<text x="${x + w / 2}" y="${mid}" font-size="9" font-weight="600" text-anchor="middle" dominant-baseline="central" fill="${fill}">${label}</text>`
  )
}
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A standalone SVG of the diagram (what is on screen: the shown tables, their edges and the notes). */
export function buildErdSvg(
  tables: ErdTable[],
  edges: ErdEdge[],
  positions: Record<string, Point>,
  colors: ErdSvgColors,
  notes: ErdNote[] = [],
  /** Lines moved by hand: edge id -> shift of the vertical leg (`wirePath`'s `dx`). */
  wires: Record<string, number> = {},
): ErdSvg {
  const placed = tables.filter((t) => positions[t.id])
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const t of placed) {
    const p = positions[t.id]!
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + t.width)
    maxY = Math.max(maxY, p.y + tableHeight(t))
  }
  for (const n of notes) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + noteWidth(n))
    maxY = Math.max(maxY, n.y + noteHeight(n.text, noteWidth(n)))
  }
  // A line dragged past the tables widens the picture so it is not cut.
  const byId = new Map(placed.map((t) => [t.id, t]))
  const ends = (e: ErdEdge) => {
    const s = byId.get(e.source)
    const t = byId.get(e.target)
    if (!s || !t) return null
    const sp = positions[s.id]!
    const tp = positions[t.id]!
    const sides = edgeSides(sp.x, s.width, tp.x, t.width, s === t)
    const sdir: 1 | -1 = sides.source === 'r' ? 1 : -1
    const tdir: 1 | -1 = sides.target === 'r' ? 1 : -1
    return { s, t, sp, tp, sdir, tdir, sx: sp.x + (sdir === 1 ? s.width : 0), tx: tp.x + (tdir === 1 ? t.width : 0) }
  }
  for (const e of edges) {
    const dx = wires[e.id]
    const end = dx ? ends(e) : null
    if (!end) continue
    const { x } = wirePath(end.sx, 0, end.sdir, end.tx, 0, end.tdir, dx)
    minX = Math.min(minX, x - 12)
    maxX = Math.max(maxX, x + 12)
  }
  if (!placed.length && !notes.length) return { svg: '', width: 0, height: 0 }
  const ox = PAD - minX
  const oy = PAD - minY
  const width = Math.ceil(maxX - minX + PAD * 2)
  const height = Math.ceil(maxY - minY + PAD * 2)

  const rowY = (t: ErdTable, column: string): number => {
    const i = t.columns.findIndex((c) => c.name === column)
    return i === -1 ? ERD_HEADER_HEIGHT / 2 : ERD_HEADER_HEIGHT + i * ERD_ROW_HEIGHT + ERD_ROW_HEIGHT / 2
  }

  const lines: string[] = []
  const labels: string[] = []
  const chips: (LabelBox & { label: string; virtual: boolean })[] = []
  for (const e of edges) {
    const end = ends(e)
    if (!end) continue
    const { s, t, sp, tp, sdir, tdir } = end
    const sx = end.sx + ox
    const sy = sp.y + oy + rowY(s, e.sourceColumn)
    const tx = end.tx + ox
    const ty = tp.y + oy + rowY(t, e.targetColumn)
    const { path: d, x: xm } = wirePath(sx, sy, sdir, tx, ty, tdir, wires[e.id] ?? 0)
    const stroke = e.virtual ? colors.accent : colors.subtle
    const dash = e.virtual ? ' stroke-dasharray="6 4"' : ''
    lines.push(
      `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.4"${dash}/>`,
      `<path d="${markerPath(sx, sy, sdir, e.sourceEnd)}${markerPath(tx, ty, tdir, e.targetEnd)}" fill="none" stroke="${stroke}" stroke-width="1.4"/>`,
    )
    // Cardinality chip on the vertical leg, like the canvas; placed after all edges are known.
    const label = cardinalityShort(e.sourceEnd, e.targetEnd)
    chips.push({ id: String(chips.length), x: xm, y: (sy + ty) / 2, width: labelChipWidth(label), height: LABEL_CHIP_HEIGHT, y1: sy, y2: ty, label, virtual: e.virtual })
  }
  const offsets = spreadLabels(chips)
  for (const c of chips) {
    const ly = c.y + (offsets.get(c.id) ?? 0)
    labels.push(
      `<rect x="${c.x - c.width / 2}" y="${ly - LABEL_CHIP_HEIGHT / 2}" width="${c.width}" height="${LABEL_CHIP_HEIGHT}" rx="4" fill="${colors.bg}" stroke="${colors.border}"/>`,
      `<text x="${c.x}" y="${ly + 4}" font-size="11" text-anchor="middle" fill="${c.virtual ? colors.accent : colors.muted}">${c.label}</text>`,
    )
  }

  const nodes: string[] = []
  for (const t of placed) {
    const p = positions[t.id]!
    const x = p.x + ox
    const y = p.y + oy
    const h = tableHeight(t)
    const w = t.width
    nodes.push(
      `<g transform="translate(${x},${y})">`,
      `<rect width="${w}" height="${h}" rx="6" fill="${colors.surface}" stroke="${colors.border}"/>`,
      `<path d="M0,${ERD_HEADER_HEIGHT} V6 a6,6 0 0 1 6,-6 H${w - 6} a6,6 0 0 1 6,6 V${ERD_HEADER_HEIGHT} Z" fill="${colors.header}"/>`,
      icon(t.kind === 'table' ? 'table' : 'view', 8, (ERD_HEADER_HEIGHT - 14) / 2, 14, colors.subtle),
      `<text x="28" y="${ERD_HEADER_HEIGHT / 2}" dominant-baseline="central" font-weight="600" font-size="12" fill="${colors.fg}">${esc(t.id)}</text>`,
    )
    // Same row as `ErdTableNode`: icon slot, name, `?`, U / D badges, type on the right.
    t.columns.forEach((c, i) => {
      const top = ERD_HEADER_HEIGHT + i * ERD_ROW_HEIGHT
      const mid = top + ERD_ROW_HEIGHT / 2
      nodes.push(`<line x1="0" x2="${w}" y1="${top}" y2="${top}" stroke="${colors.border}"/>`)
      if (c.pk) nodes.push(icon('key', 10, mid - 6, 12, colors.warning))
      else if (c.fk) nodes.push(icon('link', 10, mid - 6, 12, colors.accent))
      nodes.push(`<text x="30" y="${mid}" dominant-baseline="central" font-size="12" fill="${c.nullable ? colors.muted : colors.fg}">${esc(c.name)}</text>`)
      let cursor = 30 + c.name.length * charWidth(12) + 6
      if (c.nullable && !c.pk) {
        nodes.push(`<text x="${cursor}" y="${mid}" dominant-baseline="central" font-size="12" fill="${colors.subtle}">?</text>`)
        cursor += charWidth(12) + 6
      }
      if (c.unique || c.uniqueWith.length) {
        nodes.push(badge('U', cursor, mid, colors.accent, 0.4, colors.accent))
        cursor += charWidth(9) + 5 + 6
      }
      if (c.default !== null || c.generated) nodes.push(badge('D', cursor, mid, colors.border, 1, colors.subtle))
      nodes.push(`<text x="${w - 8}" y="${mid}" dominant-baseline="central" font-size="10" text-anchor="end" fill="${colors.subtle}">${esc(c.type)}</text>`)
    })
    nodes.push('</g>')
  }

  const comments: string[] = []
  for (const n of notes) {
    const x = n.x + ox
    const y = n.y + oy
    const nw = noteWidth(n)
    const nh = noteHeight(n.text, nw)
    comments.push(
      `<g transform="translate(${x},${y})">`,
      // The note colour may be translucent: an opaque base keeps a note over a table readable.
      `<rect width="${nw}" height="${nh}" rx="6" fill="${colors.bg}"/>`,
      `<rect width="${nw}" height="${nh}" rx="6" fill="${colors.note}" stroke="${colors.warning}" stroke-opacity="0.5"/>`,
      icon('comment', 10, 11, 14, colors.warning),
      ...noteLines(n.text, nw).map((line, i) => `<text x="${ERD_NOTE_TEXT_X}" y="${10 + i * 16 + 8}" dominant-baseline="central" font-size="12" fill="${colors.fg}" xml:space="preserve">${esc(line)}</text>`),
      '</g>',
    )
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="JetBrains Mono, ui-monospace, Menlo, Consolas, monospace">` +
    `<rect width="100%" height="100%" fill="${colors.bg}"/>` +
    lines.join('') +
    labels.join('') +
    nodes.join('') +
    comments.join('') +
    '</svg>'
  return { svg, width, height }
}
