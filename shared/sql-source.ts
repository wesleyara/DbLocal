import { maskLiterals, type SqlDialect } from './sql-split'

export interface SqlSource {
  table: string
  /** Schema / database written in front of the table, when there is one. */
  schema: string | null
  /** `select *` (or `t.*`): every column of the table is in the result. */
  star: boolean
}

const IDENT = '"(?:[^"]|"")+"|`(?:[^`]|``)+`|[A-Za-z_][\\w$]*'
const FROM_TAIL = new RegExp(`^\\s*(${IDENT})(?:\\s*\\.\\s*(${IDENT}))?`)
const REJECT = /\b(join|union|intersect|except|group\s+by|having|into|window|lateral|with)\b|\(\s*select\b/i
const STOP = /^(where|order|limit|offset|fetch|for|union|group|having|window|join|inner|left|right|full|cross|natural|on|using)$/i

const unquote = (s: string): string =>
  s[0] === '"' ? s.slice(1, -1).replace(/""/g, '"') : s[0] === '`' ? s.slice(1, -1).replace(/``/g, '`') : s

/**
 * The single table a plain `SELECT ... FROM table [alias] [WHERE ...] [ORDER BY ...] [LIMIT ...]`
 * reads from, or null for anything more involved (joins, grouping, subqueries, CTEs, several
 * tables). Used to give a query result the same decorations as the table view; being wrong would
 * mislabel a column, so it errs on the side of null.
 */
export function sourceTableOf(sql: string, dialect: SqlDialect): SqlSource | null {
  const masked = maskLiterals(sql, dialect)
  if (!/^\s*select\b/i.test(masked) || REJECT.test(masked)) return null

  let depth = 0
  let from = -1
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0 && /^from\b/i.test(masked.slice(i, i + 5)) && (i === 0 || /\W/.test(masked[i - 1]!))) {
      from = i
      break
    }
  }
  if (from === -1) return null

  const list = masked.slice(0, from).replace(/^\s*select\s+(distinct\s+)?/i, '').trim()
  const rest = sql.slice(from + 4)
  const m = FROM_TAIL.exec(rest)
  if (!m) return null
  // What follows the table name, with literals blanked: an optional alias, then WHERE / ORDER BY / LIMIT.
  const after = masked.slice(from + 4 + m[0].length)
  if (/^\s*,/.test(after)) return null
  const tail = /^\s*(?:as\s+)?([A-Za-z_][\w$]*)?/i.exec(after)
  const alias = tail?.[1]
  if (alias && !STOP.test(alias)) {
    const remainder = after.slice(tail![0].length)
    if (remainder.trim().replace(/;$/, '').trim() !== '' && !/^\s*(where|order|limit|offset|fetch|for)\b/i.test(remainder)) return null
  } else if (after.trim().replace(/;$/, '').trim() !== '' && !/^\s*(where|order|limit|offset|fetch|for)\b/i.test(after)) {
    return null
  }

  const first = unquote(m[1]!)
  const second = m[2] ? unquote(m[2]) : null
  return {
    table: second ?? first,
    schema: second ? first : null,
    star: /^(?:[A-Za-z_][\w$]*\s*\.\s*)?\*$/.test(list),
  }
}
