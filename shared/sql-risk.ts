import { maskLiterals, splitStatements, stripLeading, type SqlDialect } from './sql-split'

/**
 * Statements that destroy data or structure, found before anything runs so the UI can warn and ask
 * for the connection name, and the server can refuse them without `confirmWrites`. A heuristic on
 * the leading keywords (like `classifyStatement`): it reads `DROP`, `TRUNCATE`, `ALTER ... DROP` and
 * `DELETE` / `UPDATE` without `WHERE`.
 */
export type RiskKind = 'drop' | 'truncate' | 'deleteAll' | 'updateAll' | 'alterDrop' | 'recreate' | 'rebuild'

export interface StatementRisk {
  /** Position of the statement in the script. */
  index: number
  kind: RiskKind
  /** `danger` asks for the connection name; `warning` is only shown. */
  level: 'danger' | 'warning'
  /** Object kind for `drop` (`table`, `view`, `function`, ...). */
  object: string | null
  /** Name of the object or table, as written (without quotes). */
  target: string | null
}

const IDENT = String.raw`(?:"(?:[^"]|"")+"|\x60[^\x60]+\x60|\[[^\]]+\]|[\w$]+)`
const NAME = `(${IDENT}(?:\\s*\\.\\s*${IDENT})*)`
const DROP = new RegExp(
  String.raw`^drop\s+(materialized\s+view|table|view|schema|database|index|function|procedure|trigger|type|sequence|event|domain|extension)\s+(?:concurrently\s+)?(?:if\s+exists\s+)?${NAME}`,
  'i',
)
const CREATE = new RegExp(
  String.raw`^create\s+(?:or\s+replace\s+)?(?:temp(?:orary)?\s+)?(?:definer\s*=\s*\S+\s+)?(materialized\s+view|table|view|schema|database|index|unique\s+index|function|procedure|trigger|type|sequence|event)\s+(?:if\s+not\s+exists\s+)?${NAME}`,
  'i',
)
const TRUNCATE = new RegExp(String.raw`^truncate\s+(?:table\s+)?(?:only\s+)?${NAME}`, 'i')
const DELETE = new RegExp(String.raw`^delete\s+(?:from\s+)?(?:only\s+)?${NAME}`, 'i')
const UPDATE = new RegExp(String.raw`^update\s+(?:only\s+)?${NAME}`, 'i')
const ALTER_TABLE = new RegExp(String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${NAME}`, 'i')
/** On the masked text: `DROP COLUMN / CONSTRAINT / INDEX / ...`, not `DROP DEFAULT` or `DROP NOT NULL`. */
const ALTER_DROP = /^alter\s+table\b[\s\S]*?\bdrop\s+(?!default\b|not\s+null\b|identity\b|expression\b)/i
const RENAME_INTO = /^alter\s+table\s+(\S+)\s+rename\s+to\s+(\S+)/i

/** `"public"."Users"` → `users`: the last part, unquoted, lower-cased (for matching only). */
export function bareName(name: string): string {
  const parts = name.split(/\s*\.\s*(?=(?:[^"`]*["`][^"`]*["`])*[^"`]*$)/)
  return parts[parts.length - 1]!.replace(/^["`[]|["`\]]$/g, '').replace(/""/g, '"').toLowerCase()
}
const display = (name: string) => name.replace(/["`[\]]/g, '')
const normalizeObject = (o: string) => o.toLowerCase().replace(/\s+/g, ' ').replace('unique index', 'index')

/** The risky statements of a script. */
export function assessScript(sql: string, dialect: SqlDialect): StatementRisk[] {
  const statements = splitStatements(sql, dialect).map((s) => {
    const text = stripLeading(s.sql)
    // Literals and comments blanked, so a WHERE inside a string does not count.
    return { text, masked: maskLiterals(text, dialect) }
  })
  const created = statements.map((s) => {
    const m = CREATE.exec(s.text)
    return m ? `${normalizeObject(m[1]!)}:${bareName(m[2]!)}` : null
  })
  // SQLite rebuild: CREATE x__dblocal_new, copy, DROP x, ALTER TABLE x__dblocal_new RENAME TO x.
  const rebuilt = new Set(
    statements.map((s) => RENAME_INTO.exec(s.text)).filter((m) => m && /__dblocal_new$/i.test(display(m[1]!))).map((m) => bareName(m![2]!)),
  )

  const risks: StatementRisk[] = []
  statements.forEach(({ text, masked }, index) => {
    const add = (kind: RiskKind, target: string | null, object: string | null = null, level: 'danger' | 'warning' = 'danger') =>
      risks.push({ index, kind, level, object, target: target ? display(target) : null })
    let m = DROP.exec(text)
    if (m) {
      const object = normalizeObject(m[1]!)
      const name = bareName(m[2]!)
      if (object === 'table' && rebuilt.has(name)) return add('rebuild', m[2]!, object, 'warning')
      // Dropped and created again later in the same script: a replace (still destructive on MySQL, which cannot roll DDL back).
      if (created.slice(index + 1).includes(`${object}:${name}`)) {
        return add('recreate', m[2]!, object, dialect === 'mysql' && object === 'table' ? 'danger' : 'warning')
      }
      return add('drop', m[2]!, object)
    }
    if ((m = TRUNCATE.exec(text))) return add('truncate', m[1]!)
    if ((m = DELETE.exec(text)) && !/\bwhere\b/i.test(masked)) return add('deleteAll', m[1]!)
    if ((m = UPDATE.exec(text)) && !/\bwhere\b/i.test(masked)) return add('updateAll', m[1]!)
    if (ALTER_DROP.test(masked) && (m = ALTER_TABLE.exec(text)) && !rebuilt.has(bareName(m[1]!))) add('alterDrop', m[1]!)
  })
  return risks
}

/** True when the script has a statement that needs the connection name typed (and `confirmWrites`). */
export const hasDanger = (sql: string, dialect: SqlDialect): boolean => assessScript(sql, dialect).some((r) => r.level === 'danger')
