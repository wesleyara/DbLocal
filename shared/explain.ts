import type { PlanNode } from './types/explain'

const node = (label: string, patch: Partial<PlanNode> = {}): PlanNode => ({
  label,
  detail: null,
  cost: null,
  rows: null,
  timeMs: null,
  children: [],
  ...patch,
})

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

/** `EXPLAIN (FORMAT JSON)` of Postgres: `[{ Plan: { 'Node Type', Plans: [...] } }]`. */
export function parsePostgresPlan(json: unknown): PlanNode | null {
  const root = Array.isArray(json) ? (json[0] as Record<string, unknown> | undefined)?.Plan : (json as Record<string, unknown> | null)?.Plan
  if (!root || typeof root !== 'object') return null
  const build = (p: Record<string, unknown>): PlanNode => {
    const loops = num(p['Actual Loops']) ?? 1
    const actualTotal = num(p['Actual Total Time'])
    const detail = [
      p['Relation Name'] && `${p['Schema'] ? `${p['Schema']}.` : ''}${p['Relation Name']}${p['Alias'] && p['Alias'] !== p['Relation Name'] ? ` as ${p['Alias']}` : ''}`,
      p['Index Name'] && `index ${p['Index Name']}`,
      p['Index Cond'] && `cond: ${p['Index Cond']}`,
      p['Filter'] && `filter: ${p['Filter']}`,
      p['Hash Cond'] && `hash: ${p['Hash Cond']}`,
      p['Join Type'] && `${p['Join Type']} join`,
    ]
      .filter(Boolean)
      .join(' · ')
    return node(String(p['Node Type'] ?? 'Node'), {
      detail: detail || null,
      cost: num(p['Total Cost']),
      rows: num(p['Actual Rows']) ?? num(p['Plan Rows']),
      timeMs: actualTotal === null ? null : actualTotal * loops,
      children: Array.isArray(p['Plans']) ? (p['Plans'] as Record<string, unknown>[]).map(build) : [],
    })
  }
  return build(root as Record<string, unknown>)
}

/** `EXPLAIN FORMAT=JSON` of MySQL: nested `query_block`, `nested_loop`, `table`, ... objects. */
export function parseMysqlJsonPlan(json: unknown): PlanNode | null {
  const block = (json as { query_block?: Record<string, unknown> } | null)?.query_block
  if (!block || typeof block !== 'object') return null
  const costOf = (o: Record<string, unknown>): number | null =>
    num((o['cost_info'] as Record<string, unknown> | undefined)?.['query_cost']) ??
    num((o['cost_info'] as Record<string, unknown> | undefined)?.['prefix_cost'])

  const tableNode = (t: Record<string, unknown>): PlanNode =>
    node(`${String(t['access_type'] ?? 'table')} scan`.replace('ALL scan', 'full scan'), {
      detail: [`${t['table_name']}`, t['key'] && `index ${t['key']}`, t['attached_condition'] && `cond: ${t['attached_condition']}`]
        .filter(Boolean)
        .join(' · '),
      cost: num((t['cost_info'] as Record<string, unknown> | undefined)?.['prefix_cost']),
      rows: num(t['rows_examined_per_scan']) ?? num(t['rows_produced_per_join']),
    })

  const build = (b: Record<string, unknown>, label: string): PlanNode => {
    const children: PlanNode[] = []
    if (Array.isArray(b['nested_loop'])) {
      for (const item of b['nested_loop'] as Record<string, unknown>[]) {
        if (item['table']) children.push(tableNode(item['table'] as Record<string, unknown>))
      }
    }
    if (b['table'] && typeof b['table'] === 'object') children.push(tableNode(b['table'] as Record<string, unknown>))
    for (const key of ['ordering_operation', 'grouping_operation', 'duplicates_removal', 'windowing']) {
      if (b[key] && typeof b[key] === 'object') children.push(build(b[key] as Record<string, unknown>, key.replaceAll('_', ' ')))
    }
    if (Array.isArray(b['nested_loop']) && children.length > 1) {
      return node(label === 'query block' ? 'Nested loop' : label, { cost: costOf(b), children })
    }
    return node(label, { cost: costOf(b), children })
  }
  return build(block, 'query block')
}

/**
 * `EXPLAIN ANALYZE` of MySQL is a text tree: `-> Filter: (...)  (cost=1.2 rows=3) (actual time=0.1..0.2 rows=3 loops=1)`,
 * children indented by four spaces.
 */
export function parseMysqlTextPlan(text: string): PlanNode | null {
  const stack: { depth: number; node: PlanNode }[] = []
  let root: PlanNode | null = null
  for (const line of text.split('\n')) {
    const m = /^(\s*)->\s*(.*)$/.exec(line)
    if (!m) continue
    const depth = Math.floor(m[1]!.length / 4)
    const body = m[2]!
    const cost = /cost=([\d.]+)/.exec(body)
    const estRows = /\(cost=[^)]*rows=([\d.]+)/.exec(body)
    const actual = /actual time=[\d.]+\.\.([\d.]+) rows=([\d.]+) loops=(\d+)/.exec(body)
    const label = body.replace(/\s*\(cost=.*$/, '').replace(/\s*\(never executed\)\s*$/, '')
    const [head, ...rest] = label.split(': ')
    const n = node(head ?? label, {
      detail: rest.length > 0 ? rest.join(': ') : null,
      cost: cost ? Number(cost[1]) : null,
      rows: actual ? Number(actual[2]) : estRows ? Number(estRows[1]) : null,
      timeMs: actual ? Number(actual[1]) * Number(actual[3]) : null,
    })
    while (stack.length > 0 && stack[stack.length - 1]!.depth >= depth) stack.pop()
    const parent = stack[stack.length - 1]?.node
    if (parent) parent.children.push(n)
    else if (!root) root = n
    stack.push({ depth, node: n })
  }
  return root
}

/** `EXPLAIN QUERY PLAN` of SQLite: rows `{ id, parent, detail }` forming a forest. */
export function parseSqlitePlan(rows: { id: number; parent: number; detail: string }[]): PlanNode | null {
  if (rows.length === 0) return null
  const byId = new Map<number, PlanNode>()
  const top: PlanNode[] = []
  for (const r of rows) {
    const [head, ...rest] = r.detail.split(/ (?=USING |\(|VIA )/)
    const n = node(head ?? r.detail, { detail: rest.length > 0 ? rest.join(' ') : null })
    byId.set(r.id, n)
    const parent = byId.get(r.parent)
    if (parent) parent.children.push(n)
    else top.push(n)
  }
  return top.length === 1 ? top[0]! : node('Query plan', { children: top })
}

/** The most expensive node of each level gets highlighted: share of the root's cost (or time). */
export function planWeight(n: PlanNode): number | null {
  return n.timeMs ?? n.cost
}
