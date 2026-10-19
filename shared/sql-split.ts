import type { StatementKind } from './types/query'

export type SqlDialect = 'postgres' | 'mysql' | 'sqlite'

export interface SqlStatement {
  /** The statement text, trimmed, without the terminating `;`. Comments inside it are kept. */
  sql: string
  /** Offset of `sql` in the source text. */
  start: number
  /** Offset just after the last character of `sql`. */
  end: number
}

const isWordStart = (c: string) => /[A-Za-z_]/.test(c)
const isWordChar = (c: string) => /[A-Za-z0-9_$]/.test(c)

/** Statement kinds that may contain `;` inside a `BEGIN ... END` body. */
const COMPOUND_START = /^\s*create\s+(?:or\s+replace\s+)?(?:temp(?:orary)?\s+)?(?:definer\s*=\s*\S+\s+)?(?:trigger|procedure|function|event)\b/i

/**
 * Splits a script into statements on top-level `;`. Semicolons inside string literals, quoted
 * identifiers, comments and (Postgres) dollar-quoted bodies do not split. SQLite and MySQL
 * `CREATE TRIGGER / PROCEDURE ... BEGIN ... END` stay in one piece. Empty statements and
 * comment-only ones are dropped.
 */
export function splitStatements(text: string, dialect: SqlDialect): SqlStatement[] {
  const out: SqlStatement[] = []
  const n = text.length
  let i = 0
  let start = 0
  // Compound bodies: `begin` seen in a CREATE TRIGGER/PROCEDURE, closed by `end` right before `;`.
  let compound: boolean | null = null
  let beginSeen = false
  let lastWord = ''
  let meaningful = false

  const flush = (end: number) => {
    const raw = text.slice(start, end)
    const lead = raw.length - raw.trimStart().length
    const sql = raw.trim()
    if (meaningful && sql) out.push({ sql, start: start + lead, end: start + lead + sql.length })
    start = end + 1
    compound = null
    beginSeen = false
    lastWord = ''
    meaningful = false
  }

  while (i < n) {
    const c = text[i]!
    const next = text[i + 1]

    // Line comments: `--` (MySQL needs whitespace after it), `#` in MySQL.
    const dashComment = c === '-' && next === '-' && (dialect !== 'mysql' || /\s/.test(text[i + 2] ?? ' '))
    if (dashComment || (dialect === 'mysql' && c === '#')) {
      const nl = text.indexOf('\n', i)
      i = nl === -1 ? n : nl + 1
      continue
    }
    // Block comments (nested in Postgres).
    if (c === '/' && next === '*') {
      let depth = 1
      i += 2
      while (i < n && depth > 0) {
        if (text[i] === '*' && text[i + 1] === '/') {
          depth--
          i += 2
        } else if (dialect === 'postgres' && text[i] === '/' && text[i + 1] === '*') {
          depth++
          i += 2
        } else i++
      }
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      meaningful = true
      const backslash =
        dialect === 'mysql' && c !== '`'
          ? true
          : dialect === 'postgres' && c === "'" && /[eE]/.test(text[i - 1] ?? '') && !isWordChar(text[i - 2] ?? ' ')
      i++
      while (i < n) {
        if (backslash && text[i] === '\\') i += 2
        else if (text[i] === c) {
          if (text[i + 1] === c) i += 2
          else {
            i++
            break
          }
        } else i++
      }
      continue
    }
    if (dialect === 'sqlite' && c === '[') {
      meaningful = true
      const close = text.indexOf(']', i)
      i = close === -1 ? n : close + 1
      continue
    }
    if (dialect === 'postgres' && c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i, i + 64))
      if (m && !isWordChar(text[i - 1] ?? ' ')) {
        meaningful = true
        const close = text.indexOf(m[0], i + m[0].length)
        i = close === -1 ? n : close + m[0].length
        continue
      }
    }
    if (c === ';') {
      if (compound && beginSeen && lastWord !== 'end') {
        i++
        continue
      }
      flush(i)
      i++
      continue
    }
    if (isWordStart(c)) {
      let j = i + 1
      while (j < n && isWordChar(text[j]!)) j++
      const word = text.slice(i, j).toLowerCase()
      meaningful = true
      if (compound === null && (dialect === 'sqlite' || dialect === 'mysql')) {
        // From the first word, so a comment before CREATE TRIGGER does not hide it.
        compound = COMPOUND_START.test(text.slice(i, Math.min(n, i + 160)))
      }
      if (compound && word === 'begin') beginSeen = true
      lastWord = word
      i = j
      continue
    }
    if (!/\s/.test(c)) meaningful = true
    i++
  }
  flush(n)
  return out
}

/** The statement the cursor is in (or the closest one before it), for "run the statement under the cursor". */
export function statementAt(statements: SqlStatement[], offset: number): SqlStatement | null {
  if (statements.length === 0) return null
  let found: SqlStatement | null = null
  for (const s of statements) {
    if (offset >= s.start && offset <= s.end) return s
    if (s.start <= offset) found = s
  }
  return found ?? statements[0] ?? null
}

/**
 * Text of the statement being typed, from its start to the end of `before` (the text up to the
 * cursor). Empty right after a `;`.
 */
export function statementPrefix(before: string, dialect: SqlDialect): string {
  const last = splitStatements(before, dialect).at(-1)
  if (!last) return before.trimStart()
  const rest = before.slice(last.end)
  const semi = rest.indexOf(';')
  return semi === -1 ? before.slice(last.start) : rest.slice(semi + 1).trimStart()
}

/** Replaces leading comments and whitespace so the first keyword can be read. */
function stripLeading(sql: string): string {
  let s = sql
  for (;;) {
    const t = s.replace(/^[\s(]+/, '')
    if (t.startsWith('--') || t.startsWith('#')) {
      const nl = t.indexOf('\n')
      s = nl === -1 ? '' : t.slice(nl + 1)
    } else if (t.startsWith('/*')) {
      const close = t.indexOf('*/')
      s = close === -1 ? '' : t.slice(close + 2)
    } else return t
  }
}

/** Blanks out string literals, quoted identifiers and comments so keywords can be searched safely. */
export function maskLiterals(sql: string, dialect: SqlDialect): string {
  let out = ''
  const n = sql.length
  let i = 0
  while (i < n) {
    const c = sql[i]!
    const next = sql[i + 1]
    if ((c === '-' && next === '-') || (dialect === 'mysql' && c === '#')) {
      const nl = sql.indexOf('\n', i)
      const end = nl === -1 ? n : nl
      out += ' '.repeat(end - i)
      i = end
    } else if (c === '/' && next === '*') {
      const close = sql.indexOf('*/', i + 2)
      const end = close === -1 ? n : close + 2
      out += ' '.repeat(end - i)
      i = end
    } else if (c === "'" || c === '"' || c === '`') {
      const backslash = dialect === 'mysql' && c !== '`'
      let j = i + 1
      while (j < n) {
        if (backslash && sql[j] === '\\') j += 2
        else if (sql[j] === c) {
          if (sql[j + 1] === c) j += 2
          else {
            j++
            break
          }
        } else j++
      }
      out += ' '.repeat(Math.min(j, n) - i)
      i = Math.min(j, n)
    } else if (dialect === 'postgres' && c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64))
      if (m) {
        const close = sql.indexOf(m[0], i + m[0].length)
        const end = close === -1 ? n : close + m[0].length
        out += ' '.repeat(end - i)
        i = end
      } else {
        out += c
        i++
      }
    } else {
      out += c
      i++
    }
  }
  return out
}

const READ_WORDS = new Set(['select', 'show', 'describe', 'desc', 'values', 'table', 'explain'])
const WRITE_WORDS = new Set(['insert', 'update', 'delete', 'replace', 'merge', 'upsert', 'copy', 'call', 'load', 'lock', 'handler'])
const DDL_WORDS = new Set([
  'create', 'alter', 'drop', 'truncate', 'rename', 'comment', 'grant', 'revoke', 'reindex', 'vacuum', 'analyze',
  'cluster', 'refresh', 'attach', 'detach', 'optimize', 'repair', 'security', 'import', 'reassign',
])
const MUTATING_IN_BODY = /\b(insert|update|delete|merge|replace|truncate|create|alter|drop)\b/i

/**
 * Classifies one statement by its leading keyword, looking into `WITH` bodies and `EXPLAIN ANALYZE`
 * (which executes what it explains). It is a heuristic: the UI uses it to ask for confirmation and
 * the readonly guard refuses everything that is not `read`, with the database enforcing the rest.
 * Anything it does not recognise is `other`, which readonly refuses too.
 */
export function classifyStatement(sql: string, dialect: SqlDialect): StatementKind {
  const masked = maskLiterals(stripLeading(sql), dialect)
  const first = /^[A-Za-z_]+/.exec(masked.trimStart())?.[0]?.toLowerCase()
  if (!first) return 'other'

  if (first === 'with') {
    // A data-modifying CTE or a write after the CTE list makes the whole statement a write.
    const m = MUTATING_IN_BODY.exec(masked)
    if (!m) return 'read'
    return /^(create|alter|drop|truncate)$/i.test(m[1]!) ? 'ddl' : 'write'
  }
  if (first === 'explain') {
    if (!/\banalyze\b|\banalyse\b/i.test(masked)) return 'read'
    const m = MUTATING_IN_BODY.exec(masked)
    return m ? (/^(create|alter|drop|truncate)$/i.test(m[1]!) ? 'ddl' : 'write') : 'read'
  }
  if (first === 'pragma') return /=/.test(masked) ? 'write' : 'read'
  if (first === 'select') {
    // SELECT ... INTO creates a table (Postgres) or writes a file / variables (MySQL).
    if (/\binto\b/i.test(masked)) return dialect === 'postgres' ? 'ddl' : 'other'
    return 'read'
  }
  if (READ_WORDS.has(first)) return 'read'
  if (WRITE_WORDS.has(first)) return 'write'
  if (DDL_WORDS.has(first)) return 'ddl'
  return 'other'
}

export interface StatementSummary {
  sql: string
  kind: StatementKind
  /** Leading keyword in upper case (`SELECT`, `UPDATE`, ...), `WITH` bodies included; null when there is none. */
  verb: string | null
}

/** The statements of a script with what each one does, for the "Alert before run" confirmation. */
export function summarizeStatements(text: string, dialect: SqlDialect): StatementSummary[] {
  return splitStatements(text, dialect).map(({ sql }) => {
    const verb = /^[A-Za-z_]+/.exec(maskLiterals(stripLeading(sql), dialect).trimStart())?.[0]?.toUpperCase() ?? null
    return { sql, kind: classifyStatement(sql, dialect), verb }
  })
}
