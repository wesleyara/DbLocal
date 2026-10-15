import {
  ERD_HEADER_HEIGHT,
  ERD_NODE_WIDTH,
  ERD_ROW_HEIGHT,
  edgeSides,
  markerPath,
  tableHeight,
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
}

export interface ErdSvg {
  svg: string
  width: number
  height: number
}

const PAD = 40
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A standalone SVG of the diagram (what is on screen: the shown tables and their edges). */
export function buildErdSvg(
  tables: ErdTable[],
  edges: ErdEdge[],
  positions: Record<string, Point>,
  colors: ErdSvgColors,
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
    maxX = Math.max(maxX, p.x + ERD_NODE_WIDTH)
    maxY = Math.max(maxY, p.y + tableHeight(t))
  }
  if (!placed.length) return { svg: '', width: 0, height: 0 }
  const ox = PAD - minX
  const oy = PAD - minY
  const width = Math.ceil(maxX - minX + PAD * 2)
  const height = Math.ceil(maxY - minY + PAD * 2)
  const byId = new Map(placed.map((t) => [t.id, t]))

  const rowY = (t: ErdTable, column: string): number => {
    const i = t.columns.findIndex((c) => c.name === column)
    return i === -1 ? ERD_HEADER_HEIGHT / 2 : ERD_HEADER_HEIGHT + i * ERD_ROW_HEIGHT + ERD_ROW_HEIGHT / 2
  }

  const lines: string[] = []
  for (const e of edges) {
    const s = byId.get(e.source)
    const t = byId.get(e.target)
    if (!s || !t) continue
    const sp = positions[s.id]!
    const tp = positions[t.id]!
    const sides = edgeSides(sp.x, ERD_NODE_WIDTH, tp.x, ERD_NODE_WIDTH, s === t)
    const sdir = sides.source === 'r' ? 1 : -1
    const tdir = sides.target === 'r' ? 1 : -1
    const sx = sp.x + ox + (sdir === 1 ? ERD_NODE_WIDTH : 0)
    const sy = sp.y + oy + rowY(s, e.sourceColumn)
    const tx = tp.x + ox + (tdir === 1 ? ERD_NODE_WIDTH : 0)
    const ty = tp.y + oy + rowY(t, e.targetColumn)
    const x1 = sx + sdir * 22
    const x2 = tx + tdir * 22
    const xm = sdir === tdir ? (sdir === 1 ? Math.max(x1, x2) : Math.min(x1, x2)) : (x1 + x2) / 2
    const d = `M${sx},${sy} L${x1},${sy} L${xm},${sy} L${xm},${ty} L${x2},${ty} L${tx},${ty}`
    const stroke = e.virtual ? colors.accent : colors.subtle
    const dash = e.virtual ? ' stroke-dasharray="6 4"' : ''
    lines.push(
      `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.4"${dash}/>`,
      `<path d="${markerPath(sx, sy, sdir, e.sourceEnd)}${markerPath(tx, ty, tdir, e.targetEnd)}" fill="none" stroke="${stroke}" stroke-width="1.4"/>`,
    )
  }

  const nodes: string[] = []
  for (const t of placed) {
    const p = positions[t.id]!
    const x = p.x + ox
    const y = p.y + oy
    const h = tableHeight(t)
    nodes.push(
      `<g transform="translate(${x},${y})">`,
      `<rect width="${ERD_NODE_WIDTH}" height="${h}" rx="6" fill="${colors.surface}" stroke="${colors.border}"/>`,
      `<path d="M0,${ERD_HEADER_HEIGHT} V6 a6,6 0 0 1 6,-6 H${ERD_NODE_WIDTH - 6} a6,6 0 0 1 6,6 V${ERD_HEADER_HEIGHT} Z" fill="${colors.header}"/>`,
      `<text x="10" y="${ERD_HEADER_HEIGHT / 2 + 4}" font-weight="600" font-size="12" fill="${colors.fg}">${esc(t.id)}</text>`,
    )
    t.columns.forEach((c, i) => {
      const top = ERD_HEADER_HEIGHT + i * ERD_ROW_HEIGHT
      const mid = top + ERD_ROW_HEIGHT / 2 + 4
      nodes.push(
        `<line x1="0" x2="${ERD_NODE_WIDTH}" y1="${top}" y2="${top}" stroke="${colors.border}"/>`,
        c.pk || c.fk
          ? `<text x="8" y="${mid}" font-size="9" font-weight="700" fill="${c.pk ? colors.warning : colors.accent}">${c.pk ? 'PK' : 'FK'}</text>`
          : '',
        `<text x="28" y="${mid}" font-size="11" fill="${c.nullable ? colors.muted : colors.fg}">${esc(c.name)}</text>`,
        `<text x="${ERD_NODE_WIDTH - 8}" y="${mid}" font-size="9" text-anchor="end" fill="${colors.subtle}">${esc(c.type.slice(0, 22))}</text>`,
      )
    })
    nodes.push('</g>')
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="JetBrains Mono, ui-monospace, Menlo, Consolas, monospace">` +
    `<rect width="100%" height="100%" fill="${colors.bg}"/>` +
    lines.join('') +
    nodes.join('') +
    '</svg>'
  return { svg, width, height }
}
