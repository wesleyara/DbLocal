import type { ReferentialAction, SchemaColumn, SchemaTable } from './types/db'

/**
 * Table structure as an editable draft, and the DDL that turns one draft (or a live table) into
 * another. Pure: the structure editor builds the script here and sends it through the raw SQL
 * endpoint, so its read-only, prod and history guards apply. Identifiers are always quoted; types
 * and defaults are SQL the user typed (checked for statement breaks, not parsed).
 */

export type DdlDialect = 'postgres' | 'mysql' | 'sqlite'

export interface ColumnDraft {
  /** Name in the live table; null for a new column. Renames keep it. */
  from: string | null
  name: string
  type: string
  nullable: boolean
  /** SQL expression (`'text'`, `0`, `now()`), or null for none. */
  default: string | null
  /** Identity / auto-increment. Set on new tables; kept as is on existing columns. */
  identity: boolean
  /** Computed column: it can be renamed or dropped, nothing else. */
  computed: boolean
  /** Kept from the live column so a rewrite does not drop them (MySQL `MODIFY`). */
  comment: string | null
  onUpdate: string | null
}

export interface IndexDraft {
  from: string | null
  name: string
  columns: string[]
  unique: boolean
}

export interface ForeignKeyDraft {
  from: string | null
  name: string
  columns: string[]
  refTable: string
  refColumns: string[]
  onDelete: ReferentialAction
  onUpdate: ReferentialAction
}

export interface TableDraft {
  name: string
  columns: ColumnDraft[]
  /** Editable on a new table only. */
  primaryKey: string[]
  indexes: IndexDraft[]
  foreignKeys: ForeignKeyDraft[]
}

export type DraftError =
  | { code: 'tableName' }
  | { code: 'noColumns' }
  | { code: 'columnName'; column: string }
  | { code: 'duplicateColumn'; column: string }
  | { code: 'type'; column: string }
  | { code: 'default'; column: string }
  | { code: 'indexColumns'; name: string }
  | { code: 'duplicateName'; name: string }
  | { code: 'fkColumns'; name: string }
  | { code: 'unknownColumn'; name: string; column: string }
  | { code: 'sqliteComputed' }
  | { code: 'tableExists'; name: string }

export interface DdlScript {
  statements: string[]
  /** SQLite: the table is rebuilt (new table, copy, swap) because ALTER TABLE cannot do the change. */
  rebuild: boolean
}

export const REFERENTIAL_ACTIONS: ReferentialAction[] = ['no action', 'restrict', 'cascade', 'set null', 'set default']

/** Types offered by the type field, per dialect. Any other type can still be typed. */
export const TYPE_SUGGESTIONS: Record<DdlDialect, string[]> = {
  postgres: [
    'integer', 'bigint', 'smallint', 'numeric(12,2)', 'real', 'double precision', 'boolean', 'text', 'varchar(255)',
    'char(1)', 'uuid', 'date', 'time', 'timestamp', 'timestamptz', 'timetz', 'interval', 'jsonb', 'json', 'bytea', 'text[]', 'integer[]', 'uuid[]', 'inet', 'cidr', 'macaddr',
    'money', 'xml', 'bit(1)',
  ],
  mysql: [
    'int', 'bigint', 'smallint', 'tinyint(1)', 'decimal(12,2)', 'float', 'double', 'varchar(255)', 'char(36)', 'text',
    'longtext', 'mediumtext', 'tinytext', 'mediumint', 'date', 'time', 'year', 'datetime(3)', 'timestamp', 'json', 'blob',
    'binary(16)', 'varbinary(255)', "enum('a','b')", "set('a','b')",
  ],
  sqlite: [
    'INTEGER', 'TEXT', 'REAL', 'NUMERIC', 'BLOB', 'BOOLEAN', 'VARCHAR(255)', 'CHAR(36)', 'UUID', 'DECIMAL(12,2)', 'BIGINT', 'DOUBLE',
    'DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'JSON',
  ],
}

/** Type of the id column a new table starts with. */
export const ID_TYPE: Record<DdlDialect, string> = { postgres: 'bigint', mysql: 'bigint', sqlite: 'INTEGER' }

const quote = (dialect: DdlDialect, name: string): string =>
  dialect === 'mysql' ? `\`${name.replace(/`/g, '``')}\`` : `"${name.replace(/"/g, '""')}"`

const qualified = (dialect: DdlDialect, schema: string, name: string): string =>
  `${quote(dialect, schema)}.${quote(dialect, name)}`

const list = (dialect: DdlDialect, names: string[]): string => names.map((n) => quote(dialect, n)).join(', ')

/**
 * A type or default may hold parentheses, quotes and commas, but no statement break or comment:
 * whatever is typed stays one fragment of one statement.
 */
export function isSafeFragment(text: string): boolean {
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === "'") quoted = !quoted
    else if (!quoted && (ch === ';' || (ch === '-' && text[i + 1] === '-') || (ch === '/' && text[i + 1] === '*'))) return false
  }
  return !quoted && text.trim() !== ''
}

/** The draft of a live table: what the editor starts from and what `alterTableSql` compares with. */
export function draftFromTable(table: SchemaTable): TableDraft {
  return {
    name: table.name,
    columns: table.columns.map((c) => columnDraft(c)),
    primaryKey: table.implicitRowid ? [] : [...table.primaryKey],
    indexes: table.indexes.filter((i) => !i.primary).map((i) => ({ from: i.name, name: i.name, columns: [...i.columns], unique: i.unique })),
    foreignKeys: table.foreignKeys.map((f) => ({
      from: f.name,
      name: f.name,
      columns: [...f.columns],
      refTable: f.refTable,
      refColumns: [...f.refColumns],
      onDelete: f.onDelete,
      onUpdate: f.onUpdate,
    })),
  }
}

function columnDraft(c: SchemaColumn): ColumnDraft {
  return {
    from: c.name,
    name: c.name,
    type: c.nativeType,
    nullable: c.nullable,
    default: c.default,
    identity: !!c.identity,
    computed: c.isGenerated && !c.identity,
    comment: c.comment,
    onUpdate: c.onUpdate ?? null,
  }
}

/** A new table: an identity primary key `id` to start with. */
export function newTableDraft(dialect: DdlDialect): TableDraft {
  return {
    name: '',
    columns: [
      { from: null, name: 'id', type: ID_TYPE[dialect], nullable: false, default: null, identity: true, computed: false, comment: null, onUpdate: null },
    ],
    primaryKey: ['id'],
    indexes: [],
    foreignKeys: [],
  }
}

export const indexName = (table: string, columns: string[], unique: boolean) => `${table}_${columns.join('_')}_${unique ? 'key' : 'idx'}`
export const foreignKeyName = (table: string, columns: string[]) => `${table}_${columns.join('_')}_fkey`

/** What has to be fixed before any SQL is built. */
export function validateDraft(draft: TableDraft): DraftError[] {
  const errors: DraftError[] = []
  if (!draft.name.trim()) errors.push({ code: 'tableName' })
  if (draft.columns.length === 0) errors.push({ code: 'noColumns' })
  const seen = new Set<string>()
  for (const c of draft.columns) {
    const name = c.name.trim()
    if (!name) errors.push({ code: 'columnName', column: c.from ?? '' })
    else if (seen.has(name.toLowerCase())) errors.push({ code: 'duplicateColumn', column: name })
    seen.add(name.toLowerCase())
    if (!c.computed && !isSafeFragment(c.type)) errors.push({ code: 'type', column: name })
    if (c.default !== null && c.default.trim() !== '' && !isSafeFragment(c.default)) errors.push({ code: 'default', column: name })
  }
  const columns = new Set(draft.columns.map((c) => c.name.trim()))
  const names = new Set<string>()
  const checkName = (name: string) => {
    if (names.has(name.toLowerCase())) errors.push({ code: 'duplicateName', name })
    names.add(name.toLowerCase())
  }
  for (const i of draft.indexes) {
    checkName(i.name)
    if (!i.name.trim() || i.columns.length === 0) errors.push({ code: 'indexColumns', name: i.name })
    for (const c of i.columns) if (!columns.has(c)) errors.push({ code: 'unknownColumn', name: i.name, column: c })
  }
  for (const f of draft.foreignKeys) {
    if (f.name) checkName(f.name)
    if (f.columns.length === 0 || !f.refTable || (f.refColumns.length > 0 && f.refColumns.length !== f.columns.length)) {
      errors.push({ code: 'fkColumns', name: f.name })
    }
    for (const c of f.columns) if (!columns.has(c)) errors.push({ code: 'unknownColumn', name: f.name, column: c })
  }
  for (const c of draft.primaryKey) if (!columns.has(c)) errors.push({ code: 'unknownColumn', name: 'PRIMARY KEY', column: c })
  return errors
}

const blank = (v: string | null) => v === null || v.trim() === ''

/** `name type [NOT NULL] [DEFAULT ...]` plus the dialect's identity clause. */
function columnSql(dialect: DdlDialect, c: ColumnDraft, inlinePrimaryKey: boolean): string {
  const parts = [quote(dialect, c.name.trim()), c.type.trim()]
  if (dialect === 'sqlite' && inlinePrimaryKey) parts.push('PRIMARY KEY')
  if (c.identity && dialect === 'postgres') parts.push('GENERATED BY DEFAULT AS IDENTITY')
  if (!c.nullable && !(dialect === 'sqlite' && inlinePrimaryKey)) parts.push('NOT NULL')
  if (!blank(c.default) && !c.identity) parts.push(`DEFAULT ${c.default!.trim()}`)
  if (dialect === 'mysql') {
    if (c.onUpdate) parts.push(`ON UPDATE ${c.onUpdate}`)
    if (c.identity) parts.push('AUTO_INCREMENT')
    if (c.comment) parts.push(`COMMENT '${c.comment.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`)
  }
  return parts.join(' ')
}

const action = (a: ReferentialAction) => a.toUpperCase()

function foreignKeySql(dialect: DdlDialect, schema: string, f: ForeignKeyDraft): string {
  const named = f.name.trim() ? `CONSTRAINT ${quote(dialect, f.name.trim())} ` : ''
  // SQLite resolves a reference inside the same database by its bare name.
  const target = dialect === 'sqlite' ? quote(dialect, f.refTable) : qualified(dialect, schema, f.refTable)
  const refs = f.refColumns.length ? ` (${list(dialect, f.refColumns)})` : ''
  return `${named}FOREIGN KEY (${list(dialect, f.columns)}) REFERENCES ${target}${refs} ON DELETE ${action(f.onDelete)} ON UPDATE ${action(f.onUpdate)}`
}

/** `ALTER TABLE ... ADD` for one foreign key (a dump adds them after the data). */
export function addForeignKeySql(dialect: DdlDialect, schema: string, table: string, f: ForeignKeyDraft): string {
  return `ALTER TABLE ${qualified(dialect, schema, table)} ADD ${foreignKeySql(dialect, schema, f)};`
}

function createIndexSql(dialect: DdlDialect, schema: string, table: string, i: IndexDraft): string {
  const on = dialect === 'postgres' ? qualified(dialect, schema, table) : dialect === 'mysql' ? qualified(dialect, schema, table) : quote(dialect, table)
  const name = dialect === 'sqlite' ? qualified(dialect, schema, i.name) : quote(dialect, i.name)
  return `CREATE ${i.unique ? 'UNIQUE ' : ''}INDEX ${name} ON ${on} (${list(dialect, i.columns)});`
}

function dropIndexSql(dialect: DdlDialect, schema: string, table: string, i: IndexDraft): string[] {
  if (dialect === 'mysql') return [`DROP INDEX ${quote(dialect, i.from!)} ON ${qualified(dialect, schema, table)};`]
  if (dialect === 'postgres' && i.unique) {
    // A UNIQUE constraint owns its index and refuses DROP INDEX: drop the constraint when there is one.
    return [
      `ALTER TABLE ${qualified(dialect, schema, table)} DROP CONSTRAINT IF EXISTS ${quote(dialect, i.from!)};`,
      `DROP INDEX IF EXISTS ${qualified(dialect, schema, i.from!)};`,
    ]
  }
  return [`DROP INDEX ${qualified(dialect, schema, i.from!)};`]
}

/** CREATE TABLE plus its indexes. */
export function createTableSql(dialect: DdlDialect, schema: string, draft: TableDraft): string[] {
  const name = draft.name.trim()
  const pk = draft.primaryKey
  // SQLite: a single INTEGER key written inline is the rowid alias, which numbers rows by itself.
  const inlinePk = dialect === 'sqlite' && pk.length === 1 && draft.columns.find((c) => c.name === pk[0])?.identity === true
  const lines = draft.columns.map((c) => columnSql(dialect, c, inlinePk && c.name === pk[0]))
  if (pk.length > 0 && !inlinePk) lines.push(`PRIMARY KEY (${list(dialect, pk)})`)
  for (const f of draft.foreignKeys) lines.push(foreignKeySql(dialect, schema, f))
  const statements = [`CREATE TABLE ${qualified(dialect, schema, name)} (\n  ${lines.join(',\n  ')}\n);`]
  for (const i of draft.indexes) statements.push(createIndexSql(dialect, schema, name, i))
  return statements
}

export function dropTableSql(dialect: DdlDialect, schema: string, table: string): string {
  return `DROP TABLE ${qualified(dialect, schema, table)};`
}

const sameText = (a: string | null, b: string | null) => (blank(a) ? null : a!.trim()) === (blank(b) ? null : b!.trim())

interface ColumnChange {
  original: ColumnDraft
  draft: ColumnDraft
  renamed: boolean
  type: boolean
  nullable: boolean
  default: boolean
}

function columnChanges(original: TableDraft, draft: TableDraft): { dropped: ColumnDraft[]; added: ColumnDraft[]; changed: ColumnChange[] } {
  const kept = new Map(draft.columns.filter((c) => c.from !== null).map((c) => [c.from!, c]))
  const dropped = original.columns.filter((c) => !kept.has(c.from!))
  const added = draft.columns.filter((c) => c.from === null)
  const changed: ColumnChange[] = []
  for (const o of original.columns) {
    const d = kept.get(o.from!)
    if (!d) continue
    const change = {
      original: o,
      draft: d,
      renamed: d.name.trim() !== o.name,
      type: !d.computed && d.type.trim().toLowerCase() !== o.type.trim().toLowerCase(),
      nullable: !d.computed && d.nullable !== o.nullable,
      default: !d.computed && !sameText(d.default, o.default),
    }
    if (change.renamed || change.type || change.nullable || change.default) changed.push(change)
  }
  return { dropped, added, changed }
}

/**
 * The statements that turn `table` into `draft`. Postgres and SQLite scripts run in a transaction;
 * MySQL commits each DDL statement on its own. SQLite rebuilds the table when ALTER TABLE cannot
 * express the change (a type, NULL or default change, a foreign key, dropping a key column): the
 * table's triggers are passed in so they are created again on the new table.
 */
export function alterTableSql(dialect: DdlDialect, schema: string, table: SchemaTable, draft: TableDraft, triggers: string[] = []): DdlScript {
  const original = draftFromTable(table)
  const { dropped, added, changed } = columnChanges(original, draft)
  const keptIndexes = new Set(draft.indexes.map((i) => i.from).filter(Boolean))
  const keptFks = new Set(draft.foreignKeys.map((f) => f.from).filter(Boolean))
  const droppedIndexes = original.indexes.filter((i) => !keptIndexes.has(i.from))
  const droppedFks = original.foreignKeys.filter((f) => !keptFks.has(f.from))
  const addedIndexes = draft.indexes.filter((i) => i.from === null)
  const addedFks = draft.foreignKeys.filter((f) => f.from === null)

  if (dialect === 'sqlite' && needsRebuild(table, dropped, changed, droppedIndexes, droppedFks, addedFks)) {
    return { statements: rebuildSqlite(schema, table, original, draft, triggers), rebuild: true }
  }

  const statements: string[] = []
  const renamedTable = draft.name.trim() !== table.name
  const t = () => qualified(dialect, schema, draft.name.trim())
  if (renamedTable) {
    statements.push(
      dialect === 'mysql'
        ? `RENAME TABLE ${qualified(dialect, schema, table.name)} TO ${t()};`
        : `ALTER TABLE ${qualified(dialect, schema, table.name)} RENAME TO ${quote(dialect, draft.name.trim())};`,
    )
  }
  const name = draft.name.trim()

  for (const f of droppedFks) {
    statements.push(
      dialect === 'mysql'
        ? `ALTER TABLE ${t()} DROP FOREIGN KEY ${quote(dialect, f.from!)};`
        : `ALTER TABLE ${t()} DROP CONSTRAINT ${quote(dialect, f.from!)};`,
    )
  }
  for (const i of droppedIndexes) statements.push(...dropIndexSql(dialect, schema, name, i))
  for (const c of dropped) statements.push(`ALTER TABLE ${t()} DROP COLUMN ${quote(dialect, c.name)};`)

  for (const ch of changed) {
    const newName = ch.draft.name.trim()
    if (ch.renamed) statements.push(`ALTER TABLE ${t()} RENAME COLUMN ${quote(dialect, ch.original.name)} TO ${quote(dialect, newName)};`)
    if (!(ch.type || ch.nullable || ch.default)) continue
    // NOT NULL with a default: the rows that are NULL now take the default first, or the change fails.
    if (fillsNulls(ch)) statements.push(`UPDATE ${t()} SET ${quote(dialect, newName)} = ${ch.draft.default!.trim()} WHERE ${quote(dialect, newName)} IS NULL;`)
    if (dialect === 'mysql') {
      // MODIFY restates the whole column, so identity, ON UPDATE and comment are carried over.
      statements.push(`ALTER TABLE ${t()} MODIFY COLUMN ${columnSql(dialect, ch.draft, false)};`)
      continue
    }
    const col = `ALTER TABLE ${t()} ALTER COLUMN ${quote(dialect, newName)}`
    if (ch.type) {
      const type = ch.draft.type.trim()
      statements.push(`${col} TYPE ${type} USING ${quote(dialect, newName)}::${type};`)
    }
    if (ch.nullable) statements.push(`${col} ${ch.draft.nullable ? 'DROP' : 'SET'} NOT NULL;`)
    if (ch.default) statements.push(blank(ch.draft.default) ? `${col} DROP DEFAULT;` : `${col} SET DEFAULT ${ch.draft.default!.trim()};`)
  }

  for (const c of added) statements.push(`ALTER TABLE ${t()} ADD COLUMN ${columnSql(dialect, c, false)};`)
  for (const i of addedIndexes) statements.push(createIndexSql(dialect, schema, name, i))
  for (const f of addedFks) statements.push(`ALTER TABLE ${t()} ADD ${foreignKeySql(dialect, schema, f)};`)
  return { statements, rebuild: false }
}

const fillsNulls = (ch: ColumnChange) => ch.nullable && !ch.draft.nullable && !blank(ch.draft.default)

/** SQLite's ALTER TABLE renames and adds or drops plain columns; everything else needs a rebuild. */
function needsRebuild(
  table: SchemaTable,
  dropped: ColumnDraft[],
  changed: ColumnChange[],
  droppedIndexes: IndexDraft[],
  droppedFks: ForeignKeyDraft[],
  addedFks: ForeignKeyDraft[],
): boolean {
  if (changed.some((c) => c.type || c.nullable || c.default)) return true
  if (droppedFks.length > 0 || addedFks.length > 0) return true
  if (droppedIndexes.some((i) => i.from!.startsWith('sqlite_autoindex_'))) return true
  const bound = new Set([
    ...table.primaryKey,
    ...table.foreignKeys.flatMap((f) => f.columns),
    ...table.indexes.flatMap((i) => i.columns),
  ])
  return dropped.some((c) => bound.has(c.name))
}

/**
 * The SQLite rebuild: create the new table under a temporary name, copy the kept columns, drop the
 * old one, rename, then create the indexes and triggers again. Foreign key checks are off while the
 * table is swapped (the pragma only works outside the transaction).
 */
function rebuildSqlite(schema: string, table: SchemaTable, original: TableDraft, draft: TableDraft, triggers: string[]): string[] {
  const name = draft.name.trim()
  const temp = `${name}__dblocal_new`
  const renames = new Map(draft.columns.filter((c) => c.from !== null).map((c) => [c.from!, c.name.trim()]))
  const rename = (cols: string[]) => cols.map((c) => renames.get(c) ?? c)
  const key = rename(original.primaryKey).filter((c) => draft.columns.some((d) => d.name.trim() === c))
  // The rowid alias stays one: a single INTEGER key kept inline.
  const integerKey = key.length === 1 && /^integer$/i.test(draft.columns.find((c) => c.name.trim() === key[0])?.type.trim() ?? '')
  const columns = draft.columns.map((c) => ({ ...c, identity: integerKey && c.name.trim() === key[0] }))
  const indexes = draft.indexes
    .filter((i) => !(i.from ?? '').startsWith('sqlite_autoindex_'))
    .map((i) => ({ ...i, columns: i.from === null ? i.columns : rename(i.columns) }))
  // Unique constraints written in CREATE TABLE come back as autoindexes: they become named indexes.
  for (const i of draft.indexes.filter((x) => (x.from ?? '').startsWith('sqlite_autoindex_'))) {
    const cols = rename(i.columns)
    indexes.push({ from: null, name: indexName(name, cols, true), columns: cols, unique: true })
  }
  const foreignKeys = draft.foreignKeys.map((f) => ({ ...f, columns: f.from === null ? f.columns : rename(f.columns) }))
  const created = createTableSql('sqlite', schema, { name: temp, columns, primaryKey: key, indexes: [], foreignKeys })
  const copied = draft.columns.filter((c) => c.from !== null)
  const into = list('sqlite', copied.map((c) => c.name.trim()))
  const wasNullable = new Set(original.columns.filter((c) => c.nullable).map((c) => c.from!))
  // A column that becomes NOT NULL with a default copies the default into its NULL rows.
  const from = copied
    .map((c) =>
      wasNullable.has(c.from!) && !c.nullable && !blank(c.default)
        ? `coalesce(${quote('sqlite', c.from!)}, ${c.default!.trim()})`
        : quote('sqlite', c.from!),
    )
    .join(', ')
  return [
    'PRAGMA foreign_keys = OFF;',
    'BEGIN;',
    ...created,
    ...(copied.length ? [`INSERT INTO ${qualified('sqlite', schema, temp)} (${into}) SELECT ${from} FROM ${qualified('sqlite', schema, table.name)};`] : []),
    `DROP TABLE ${qualified('sqlite', schema, table.name)};`,
    `ALTER TABLE ${qualified('sqlite', schema, temp)} RENAME TO ${quote('sqlite', name)};`,
    ...indexes.map((i) => createIndexSql('sqlite', schema, name, i)),
    ...triggers.map((tr) => (tr.trim().endsWith(';') ? tr.trim() : `${tr.trim()};`)),
    'COMMIT;',
    'PRAGMA foreign_keys = ON;',
  ]
}

/** Whether a rebuild is possible: SQLite does not report the expression of a computed column. */
export function canRebuild(table: SchemaTable): boolean {
  return !table.columns.some((c) => c.isGenerated && !c.identity)
}

/** The script to run: Postgres and SQLite DDL in one transaction (a SQLite rebuild brings its own). */
export function scriptOf(dialect: DdlDialect, ddl: DdlScript): string {
  if (ddl.statements.length === 0) return ''
  if (dialect === 'mysql' || ddl.rebuild) return ddl.statements.join('\n')
  return ['BEGIN;', ...ddl.statements, 'COMMIT;'].join('\n')
}
