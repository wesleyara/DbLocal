import type { RelationGraph, SchemaSnapshot } from './types/db'

export type SuggestionKind = 'table' | 'column' | 'keyword' | 'function' | 'join'

export interface Suggestion {
  label: string
  kind: SuggestionKind
  /** Text inserted; defaults to the label. */
  insert?: string
  detail?: string
  /** Lower sorts first. */
  rank: number
}

const KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN',
  'INNER JOIN', 'ON', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'IS NULL', 'IS NOT NULL', 'BETWEEN', 'AS', 'DISTINCT',
  'UNION', 'UNION ALL', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE',
  'DROP TABLE', 'WITH', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'ASC', 'DESC', 'EXISTS', 'EXPLAIN',
]

const FUNCTIONS: Record<'common' | 'postgres' | 'mysql' | 'sqlite', string[]> = {
  common: ['count', 'sum', 'avg', 'min', 'max', 'coalesce', 'nullif', 'lower', 'upper', 'length', 'substr', 'trim', 'replace', 'abs', 'round', 'cast'],
  postgres: ['now', 'date_trunc', 'extract', 'string_agg', 'array_agg', 'jsonb_build_object', 'to_char', 'generate_series', 'gen_random_uuid', 'ilike'],
  mysql: ['now', 'concat', 'date_format', 'group_concat', 'ifnull', 'if', 'json_extract', 'curdate', 'uuid'],
  sqlite: ['datetime', 'date', 'strftime', 'ifnull', 'group_concat', 'json_extract', 'random', 'typeof'],
}

const NOT_ALIAS = new Set([
  'where', 'on', 'join', 'left', 'right', 'inner', 'outer', 'cross', 'full', 'group', 'order', 'limit', 'having',
  'union', 'using', 'set', 'values', 'offset', 'natural', 'select', 'from', 'and', 'or',
])

const unquote = (s: string): string => s.replace(/^["`[]|["`\]]$/g, '')

/** Tables named after FROM / JOIN / UPDATE / INTO, with their alias (or the table name itself). */
export function tablesInScope(sql: string): Map<string, string> {
  const scope = new Map<string, string>()
  const re = /\b(?:from|join|update|into)\s+((?:["`]?[\w$]+["`]?\.)?["`]?[\w$]+["`]?)(?:\s+(?:as\s+)?(["`]?[\w$]+["`]?))?/gi
  for (const m of sql.matchAll(re)) {
    const full = unquote(m[1]!.split('.').pop()!)
    const alias = m[2] ? unquote(m[2]) : null
    scope.set(full, full)
    if (alias && !NOT_ALIAS.has(alias.toLowerCase())) scope.set(alias, full)
  }
  return scope
}

/**
 * Suggestions at the end of `before` (the text up to the cursor). `full` is the whole script, so
 * tables referenced after the cursor still resolve aliases (`select u.| from users u`).
 */
export function suggest(before: string, full: string, snapshot: SchemaSnapshot | null, graph: RelationGraph | null): Suggestion[] {
  const out: Suggestion[] = []
  const dialect = snapshot?.dialect ?? 'postgres'
  const tables = snapshot?.tables ?? []
  const byName = new Map(tables.map((t) => [t.name, t]))
  const scope = tablesInScope(full)

  // `alias.` or `table.`: only that table's columns.
  const dotted = /([\w$"`]+)\.([\w$]*)$/.exec(before)
  if (dotted) {
    const owner = scope.get(unquote(dotted[1]!)) ?? unquote(dotted[1]!)
    const table = byName.get(owner)
    if (table) {
      return table.columns.map((c) => ({ label: c.name, kind: 'column' as const, detail: c.nativeType, rank: c.isPrimaryKey ? 0 : 1 }))
    }
    return []
  }

  // Right after JOIN: relations of the tables already in the FROM clause.
  if (/\bjoin\s+[\w$"`]*$/i.test(before) && graph) {
    const used = new Set(scope.values())
    const aliasOf = (table: string): string => [...scope.entries()].find(([a, t]) => t === table && a !== t)?.[0] ?? table
    const taken = new Set(scope.keys())
    for (const from of used) {
      const node = graph.tables[from]
      if (!node) continue
      for (const ref of [...node.outgoing, ...node.incoming]) {
        if (ref.cardinality === 'many-to-many' || ref.columns.length === 0) continue
        let alias = ref.target[0]!.toLowerCase()
        for (let i = 2; taken.has(alias); i++) alias = `${ref.target[0]!.toLowerCase()}${i}`
        const left = aliasOf(from)
        const on = ref.columns.map((c, i) => `${alias}.${ref.targetColumns[i]} = ${left}.${c}`).join(' AND ')
        out.push({
          label: `${ref.target} ${alias} ON …`,
          insert: `${ref.target} ${alias} ON ${on}`,
          kind: 'join',
          detail: `${ref.name}${ref.virtual ? ' (virtual)' : ''}`,
          rank: -1,
        })
      }
    }
  }

  for (const t of tables) out.push({ label: t.name, kind: 'table', detail: t.kind, rank: scope.has(t.name) ? 1 : 2 })
  const seen = new Set<string>()
  for (const real of new Set(scope.values())) {
    for (const c of byName.get(real)?.columns ?? []) {
      if (seen.has(c.name)) continue
      seen.add(c.name)
      out.push({ label: c.name, kind: 'column', detail: `${real}.${c.nativeType}`, rank: 0 })
    }
  }
  for (const k of KEYWORDS) out.push({ label: k, kind: 'keyword', rank: 5 })
  for (const f of [...FUNCTIONS.common, ...FUNCTIONS[dialect]]) {
    out.push({ label: f, kind: 'function', insert: `${f}(`, rank: 6 })
  }
  return out
}
