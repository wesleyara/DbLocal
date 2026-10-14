/** Normalised column category, the same for every dialect. Drives filters, renderers and editors. */
export type ColumnKind =
  | 'number'
  | 'string'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'time'
  | 'json'
  | 'uuid'
  | 'enum'
  | 'binary'
  | 'array'
  | 'other'

export type ReferentialAction = 'no action' | 'restrict' | 'cascade' | 'set null' | 'set default'

export interface SchemaColumn {
  name: string
  /** Type as the database declares it, e.g. `character varying(255)` or `ENUM('a','b')`. */
  nativeType: string
  kind: ColumnKind
  nullable: boolean
  default: string | null
  /** Generated (computed) column or identity / auto-increment. */
  isGenerated: boolean
  isPrimaryKey: boolean
  comment: string | null
  /** Allowed values, only for `kind: 'enum'`. */
  enumValues: string[] | null
}

export interface SchemaForeignKey {
  name: string
  columns: string[]
  refSchema: string | null
  refTable: string
  /** Empty when the FK omits the target columns (SQLite): the graph then uses the target's PK. */
  refColumns: string[]
  onDelete: ReferentialAction
  onUpdate: ReferentialAction
}

export interface SchemaIndex {
  name: string
  columns: string[]
  unique: boolean
  primary: boolean
}

export type SchemaTableKind = 'table' | 'view' | 'materialized_view'

export interface SchemaTable {
  name: string
  kind: SchemaTableKind
  columns: SchemaColumn[]
  primaryKey: string[]
  foreignKeys: SchemaForeignKey[]
  indexes: SchemaIndex[]
  /**
   * SQLite table without a PK: `primaryKey` is `['rowid']`, the implicit row id. It is not a
   * column, so `SELECT *` does not return it; editors must read it explicitly.
   */
  implicitRowid: boolean
  /** Estimated row count (`reltuples`, `TABLE_ROWS`, ...). Null when unknown. */
  rowEstimate: number | null
  comment: string | null
}

/** Introspection result for one schema (Postgres schema, MySQL database, SQLite attached database). */
export interface SchemaSnapshot {
  dialect: 'postgres' | 'mysql' | 'sqlite'
  schema: string
  tables: SchemaTable[]
  readAt: string
}

export type Cardinality = 'many-to-one' | 'one-to-many' | 'one-to-one' | 'many-to-many'

/** One navigable side of a relation, seen from the table it belongs to. */
export interface RelationRef {
  /** Stable id of the relation (shared by both sides). */
  relationId: string
  /** Name shown when navigating from this table, e.g. `orders.user`. */
  name: string
  /** Table on the other end. */
  target: string
  cardinality: Cardinality
  /** Columns on this table used for the join. */
  columns: string[]
  /** Columns on the target table used for the join (for N:N: the junction is in `via`). */
  targetColumns: string[]
  /** Junction table for many-to-many. */
  via: string | null
  virtual: boolean
}

export interface RelationGraph {
  /** Table name -> relations leaving (`outgoing`, FK side) and arriving (`incoming`) at it. */
  tables: Record<string, { displayColumn: string | null; outgoing: RelationRef[]; incoming: RelationRef[] }>
  relations: Relation[]
}

/** A relation as stored once: the FK side is `from`. Navigation uses the per-table refs. */
export interface Relation {
  id: string
  name: string
  inverseName: string
  cardinality: Cardinality
  from: { table: string; columns: string[] }
  to: { table: string; columns: string[] }
  via: { table: string; fromColumns: string[]; toColumns: string[] } | null
  virtual: boolean
  onDelete: ReferentialAction | null
  selfReference: boolean
}

/** A user-declared relation with no physical FK. Same meaning as the FK it imitates. */
export interface VirtualRelationDef {
  id: string
  name: string | null
  fromTable: string
  fromColumns: string[]
  toTable: string
  toColumns: string[]
  cardinality: Cardinality
}

/** `GET /api/c/:id/schema` payload. */
export interface SchemaResponse {
  snapshot: SchemaSnapshot
  graph: RelationGraph
  cached: boolean
}
