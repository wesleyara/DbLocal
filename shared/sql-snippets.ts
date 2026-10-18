import { statementPrefix, type SqlDialect } from './sql-split'
import type { SchemaSnapshot, SchemaTable } from './types/db'

/**
 * A snippet for the SQL editor. `body` uses the Monaco/VS Code snippet syntax (`${1:default}`,
 * `${2|a,b|}` choices, `${1}` mirrors, `$0` final cursor); its description is the i18n key
 * `query.snippets.<id>`.
 */
export interface Snippet {
  id: string
  label: string
  body: string
  /** Lower sorts first. */
  rank: number
  /** Characters before the cursor the snippet replaces (the words typed so far, `create ta`). */
  replace?: number
}

/** Where the cursor is, as far as snippets care. */
export type SnippetContext =
  | { kind: 'statement'; typed: string }
  | { kind: 'alter'; table: string }
  | { kind: 'create-body' }
  | { kind: 'none' }

const MAX_CHOICES = 50
const ON_DELETE = 'cascade,set null,restrict,no action'

/** Escapes text for a literal part of a snippet body. */
export const escapeSnippet = (s: string): string => s.replace(/[\\$}]/g, (c) => `\\${c}`)
const escapeChoice = (s: string): string => s.replace(/[\\$}|,]/g, (c) => `\\${c}`)

const unquote = (s: string): string => s.replace(/^["`[]|["`\]]$/g, '')

/** Snippet context of the text up to the cursor. */
export function snippetContext(before: string, dialect: SqlDialect): SnippetContext {
  const stmt = statementPrefix(before, dialect)
  const alter = /^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?((?:["`]?[\w$]+["`]?\.)?["`]?[\w$]+["`]?)\s+\w*$/i.exec(stmt)
  if (alter) return { kind: 'alter', table: unquote(alter[1]!.split('.').pop()!) }
  const create = /^create\s+(?:temp(?:orary)?\s+)?table\s+(?:if\s+not\s+exists\s+)?[\w$."`]+\s*\(/i.exec(stmt)
  if (create) {
    const body = stmt.slice(create[0].length)
    let depth = 1
    for (const c of body) {
      if (c === '(') depth++
      else if (c === ')') depth--
    }
    // At the start of a column definition: right after `(` or `,`, maybe with a partial word.
    if (depth === 1 && /(?:^|,)\s*\w*$/.test(body)) return { kind: 'create-body' }
  }
  // The first words of a statement, on one line (a completion range cannot span lines).
  if (/^(?:[a-z_]+(?:[ \t]+[a-z_]+)*[ \t]*)?$/i.test(stmt)) return { kind: 'statement', typed: stmt }
  return { kind: 'none' }
}

interface DialectParts {
  id: string
  fkType: string
  timestamps: string
  begin: string
}

const PARTS: Record<SqlDialect, DialectParts> = {
  postgres: {
    id: 'id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY',
    fkType: 'bigint',
    timestamps: 'created_at timestamptz NOT NULL DEFAULT now(),\n  updated_at timestamptz NOT NULL DEFAULT now()',
    begin: 'BEGIN',
  },
  mysql: {
    id: 'id bigint unsigned AUTO_INCREMENT PRIMARY KEY',
    fkType: 'bigint unsigned',
    timestamps: 'created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    begin: 'START TRANSACTION',
  },
  sqlite: {
    id: 'id integer PRIMARY KEY AUTOINCREMENT',
    fkType: 'integer',
    timestamps: "created_at text NOT NULL DEFAULT (datetime('now')),\n  updated_at text NOT NULL DEFAULT (datetime('now'))",
    begin: 'BEGIN',
  },
}

/** `${n|a,b|}` with the given names, or `${n:fallback}` when there are none. */
function choice(n: number, names: string[], fallback: string): string {
  const list = names.slice(0, MAX_CHOICES)
  return list.length ? `\${${n}|${list.map(escapeChoice).join(',')}|}` : `\${${n}:${fallback}}`
}

/** Naive singular for FK column names: `users` -> `user`, `categories` -> `category`. */
export function singular(name: string): string {
  if (/ies$/i.test(name)) return `${name.slice(0, -3)}y`
  if (/(xes|ches|shes|sses)$/i.test(name)) return name.slice(0, -2)
  if (/(ss|us)$/i.test(name)) return name
  return name.replace(/s$/i, '')
}

/** Native type of a table's single-column primary key, without auto-increment decorations. */
function pkType(table: SchemaTable): { column: string; type: string } | null {
  const pk = table.columns.filter((c) => c.isPrimaryKey)
  if (pk.length !== 1) return null
  const type = pk[0]!.nativeType.replace(/\s*auto_increment/i, '').replace(/^bigserial$/i, 'bigint').replace(/^serial$/i, 'integer')
  return { column: pk[0]!.name, type }
}

/** `ALTER TABLE` tails; `tbl` is either a mirror (`${1}`) or the literal table name. */
function alterTails(dialect: SqlDialect, tables: string[], columns: string[]): Array<{ id: string; label: string; tail: (tbl: string) => string }> {
  const col = (n: number, fallback: string) => choice(n, columns, fallback)
  const out = [
    { id: 'addColumn', label: 'add column', tail: () => `ADD COLUMN \${2:column} \${3:text};$0` },
    {
      id: 'addForeignKey',
      label: 'add foreign key',
      tail: (tbl: string) =>
        dialect === 'sqlite'
          ? `ADD COLUMN \${2:column} ${PARTS.sqlite.fkType} REFERENCES ${choice(3, tables, 'parent')}(\${4:id}) ON DELETE \${5|${ON_DELETE}|};$0`
          : `ADD CONSTRAINT fk_${tbl}_\${2:column} FOREIGN KEY (\${2}) REFERENCES ${choice(3, tables, 'parent')} (\${4:id}) ON DELETE \${5|${ON_DELETE}|};$0`,
    },
    { id: 'renameColumn', label: 'rename column', tail: () => `RENAME COLUMN ${col(2, 'old_name')} TO \${3:new_name};$0` },
    { id: 'dropColumn', label: 'drop column', tail: () => `DROP COLUMN ${col(2, 'column')};$0` },
  ]
  if (dialect !== 'sqlite') {
    out.push({ id: 'addUnique', label: 'add unique', tail: (tbl: string) => `ADD CONSTRAINT ${tbl}_\${2:column}_key UNIQUE (\${2});$0` })
  }
  return out
}

/** Snippets for the cursor position described by `before` (the text up to the cursor). */
export function snippetsFor(before: string, dialect: SqlDialect, snapshot: SchemaSnapshot | null): Snippet[] {
  const ctx = snippetContext(before, dialect)
  const p = PARTS[dialect]
  const real = (snapshot?.tables ?? []).filter((t) => t.kind === 'table')
  const names = real.map((t) => t.name)
  const t = (n: number) => choice(n, names, 'table')
  const onDelete = (n: number) => `ON DELETE \${${n}|${ON_DELETE}|}`

  if (ctx.kind === 'alter') {
    const table = real.find((x) => x.name === ctx.table)
    const columns = table?.columns.map((c) => c.name) ?? []
    return alterTails(dialect, names, columns).map((s) => ({ id: s.id, label: s.label, body: s.tail(escapeSnippet(ctx.table)), rank: -1 }))
  }

  if (ctx.kind === 'create-body') {
    const out: Snippet[] = [
      { id: 'idColumn', label: 'id', body: `${p.id},\n  $0`, rank: -1 },
      { id: 'timestamps', label: 'timestamps', body: `${p.timestamps}$0`, rank: -1 },
      { id: 'references', label: 'references', body: `\${1:parent_id} ${p.fkType} NOT NULL REFERENCES ${t(2)} (\${3:id}) ${onDelete(4)}$0`, rank: -1 },
      { id: 'foreignKeyConstraint', label: 'foreign key', body: `FOREIGN KEY (\${1:parent_id}) REFERENCES ${t(2)} (\${3:id}) ${onDelete(4)}$0`, rank: -1 },
      { id: 'primaryKeyConstraint', label: 'primary key', body: `PRIMARY KEY (\${1:a_id}, \${2:b_id})$0`, rank: -1 },
    ]
    // One "fk → table" per table with a single-column key, typed like that key.
    for (const table of real) {
      const pk = pkType(table)
      if (!pk) continue
      const column = `${singular(table.name)}_${pk.column}`
      out.push({
        id: 'fkTo',
        label: `fk → ${table.name}`,
        body: `\${1:${escapeSnippet(column)}} ${escapeSnippet(pk.type)} NOT NULL REFERENCES ${escapeSnippet(table.name)} (${escapeSnippet(pk.column)}) ${onDelete(2)}$0`,
        rank: 0,
      })
    }
    return out
  }

  if (ctx.kind !== 'statement') return []

  const fk = (tbl: string, n: number) => `${tbl}_id ${p.fkType} NOT NULL REFERENCES ${tbl} (id) ON DELETE \${${n}|${ON_DELETE}|}`
  const out: Snippet[] = [
    { id: 'createTable', label: 'create table', body: `CREATE TABLE \${1:name} (\n  ${p.id},\n  \${2:column} \${3:text} NOT NULL,\n  ${p.timestamps}\n);$0` },
    {
      id: 'createTableFk',
      label: 'create table with foreign key',
      body: `CREATE TABLE \${1:name} (\n  ${p.id},\n  \${2:parent_id} ${p.fkType} NOT NULL REFERENCES ${t(3)} (\${4:id}) ${onDelete(5)},\n  \${6:column} \${7:text} NOT NULL,\n  ${p.timestamps}\n);$0`,
    },
    {
      id: 'createJunction',
      label: 'create junction table (N:N)',
      body: `CREATE TABLE ${t(1)}_${t(2)} (\n  ${fk('${1}', 3)},\n  ${fk('${2}', 4)},\n  PRIMARY KEY (\${1}_id, \${2}_id)\n);$0`,
    },
    { id: 'createIndex', label: 'create index', body: `CREATE INDEX ${t(1)}_\${2:column}_idx ON \${1} (\${2});$0` },
    { id: 'createUniqueIndex', label: 'create unique index', body: `CREATE UNIQUE INDEX ${t(1)}_\${2:column}_key ON \${1} (\${2});$0` },
    { id: 'createView', label: 'create view', body: `CREATE VIEW \${1:name} AS\nSELECT \${2:*}\nFROM ${t(3)}\nWHERE \${4:condition};$0` },
    ...alterTails(dialect, names, []).map((s) => ({ id: s.id, label: `alter table ${s.label}`, body: `ALTER TABLE ${t(1)} ${s.tail('${1}')}` })),
    { id: 'dropTable', label: 'drop table', body: `DROP TABLE IF EXISTS ${t(1)};$0` },
    { id: 'insert', label: 'insert into', body: `INSERT INTO ${t(1)} (\${2:columns})\nVALUES (\${3:values});$0` },
    { id: 'update', label: 'update', body: `UPDATE ${t(1)}\nSET \${2:column} = \${3:value}\nWHERE \${4:id} = \${5:value};$0` },
    { id: 'delete', label: 'delete from', body: `DELETE FROM ${t(1)}\nWHERE \${2:id} = \${3:value};$0` },
    {
      id: 'upsert',
      label: 'upsert',
      body: dialect === 'mysql'
        ? `INSERT INTO ${t(1)} (\${2:id}, \${3:column})\nVALUES (\${4:value}, \${5:value})\nON DUPLICATE KEY UPDATE \${3} = VALUES(\${3});$0`
        : `INSERT INTO ${t(1)} (\${2:id}, \${3:column})\nVALUES (\${4:value}, \${5:value})\nON CONFLICT (\${2}) DO UPDATE SET \${3} = excluded.\${3};$0`,
    },
    { id: 'selectJoin', label: 'select join', body: `SELECT \${5:*}\nFROM ${t(1)} a\nJOIN ${t(2)} b ON b.\${3:a_id} = a.\${4:id};$0` },
    { id: 'cte', label: 'with (CTE)', body: `WITH \${1:name} AS (\n  SELECT \${2:*}\n  FROM ${t(3)}\n)\nSELECT *\nFROM \${1};$0` },
    { id: 'transaction', label: 'transaction', body: `${p.begin};\n$0\nCOMMIT;` },
  ].map((s) => ({ ...s, rank: 3 }))
  if (dialect === 'postgres') out.push({ id: 'createEnum', label: 'create type enum', body: `CREATE TYPE \${1:name} AS ENUM (\${2:'a', 'b'});$0`, rank: 3 })
  const typed = ctx.typed.toLowerCase().replace(/\s+/g, ' ')
  // Several words typed: only the snippets they start, replacing them all.
  const shown = typed.includes(' ') ? out.filter((s) => s.label.startsWith(typed)) : out
  return shown.map((s) => ({ ...s, replace: ctx.typed.length }))
}

/** Readable text of a snippet body: placeholders become their default (or first choice). */
export function snippetPreview(body: string): string {
  const defaults = new Map<string, string>()
  const unescape = (v: string): string => v.replace(/\\(.)/g, '$1')
  return body
    .replace(/\$\{(\d+)\|((?:\\.|[^|\\])*)\|\}/g, (_m, n: string, list: string) => {
      const first = unescape(list.split(/(?<!\\),/)[0]!)
      defaults.set(n, first)
      return first
    })
    .replace(/\$\{(\d+):((?:\\.|[^}\\])*)\}/g, (_m, n: string, d: string) => {
      defaults.set(n, unescape(d))
      return unescape(d)
    })
    .replace(/\$\{(\d+)\}|\$(\d+)/g, (_m, a: string | undefined, b: string | undefined) => defaults.get(a ?? b!) ?? '')
    .replace(/\\([\\$}])/g, '$1')
}
