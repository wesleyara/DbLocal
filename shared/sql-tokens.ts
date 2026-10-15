export interface SqlToken {
  text: string
  kind: 'keyword' | 'string' | 'number' | 'identifier' | 'text'
}

const KEYWORDS = new Set([
  'insert', 'into', 'values', 'update', 'set', 'delete', 'from', 'where', 'and', 'or', 'not', 'null', 'default',
  'returning', 'select', 'limit', 'is', 'in', 'true', 'false',
])

const TOKEN = /('(?:[^']|'')*')|("(?:[^"]|"")*"|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]+)|(\s+|[^\sA-Za-z_0-9'"`]+)/g

/**
 * Splits SQL into tokens for syntax colouring. The result is rendered with `v-for`, never as
 * HTML, so a value containing markup cannot inject anything.
 */
export function tokenizeSql(sql: string): SqlToken[] {
  const out: SqlToken[] = []
  for (const m of sql.matchAll(TOKEN)) {
    if (m[1]) out.push({ text: m[1], kind: 'string' })
    else if (m[2]) out.push({ text: m[2], kind: 'identifier' })
    else if (m[3]) out.push({ text: m[3], kind: 'number' })
    else if (m[4]) out.push({ text: m[4], kind: KEYWORDS.has(m[4].toLowerCase()) ? 'keyword' : 'text' })
    else out.push({ text: m[0], kind: 'text' })
  }
  return out
}
