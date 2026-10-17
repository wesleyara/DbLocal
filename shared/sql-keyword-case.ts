import { maskLiterals, type SqlDialect } from './sql-split'

/** Keywords and functions the grid's compiled SELECT can contain (Kysely writes them in lower case). */
const KEYWORDS = new Set([
  'select', 'distinct', 'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null', 'like', 'ilike', 'escape', 'between',
  'order', 'by', 'asc', 'desc', 'nulls', 'first', 'last', 'limit', 'offset', 'as', 'on', 'join', 'inner', 'left',
  'right', 'outer', 'exists', 'true', 'false', 'lower', 'upper', 'cast', 'count', 'case', 'when', 'then', 'else', 'end',
  'group', 'having', 'union', 'all', 'with',
])

/**
 * Writes the SQL keywords of `sql` in upper case, as the editor's autocomplete does. Strings, quoted
 * identifiers and comments are left untouched, and so are bare words that are not keywords.
 */
export function upperKeywords(sql: string, dialect: SqlDialect): string {
  const masked = maskLiterals(sql, dialect)
  return sql.replace(/[A-Za-z_][A-Za-z0-9_$]*/g, (word, offset: number) => {
    // A word inside a literal is blanked in the masked text; a word right after `$` or `.` is a name.
    if (masked[offset] === ' ' || /[.$]/.test(sql[offset - 1] ?? '')) return word
    return KEYWORDS.has(word.toLowerCase()) ? word.toUpperCase() : word
  })
}
