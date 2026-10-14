import type { ColumnKind, SchemaSnapshot } from './db'

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'in'
  | 'not_in'
  | 'is_null'
  | 'is_not_null'
  | 'between'
  | 'is_true'
  | 'is_false'

export type FilterValue = string | number | boolean | Array<string | number>

export interface FilterCondition {
  type: 'condition'
  column: string
  op: FilterOperator
  /** Scalar for comparisons, array for `in` / `not_in` / `between`, absent for the null and boolean checks. */
  value?: FilterValue
}

export interface FilterGroup {
  type: 'group'
  logic: 'and' | 'or'
  children: FilterNode[]
}

/** Filter AST. Converted to parameterised SQL on the server; the client never builds SQL. */
export type FilterNode = FilterCondition | FilterGroup

export interface SortItem {
  column: string
  direction: 'asc' | 'desc'
}

export const PAGE_SIZES = [50, 100, 250, 500] as const
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 500

/** Estimated counts up to this many rows are replaced by an exact count (it is cheap enough). */
export const EXACT_COUNT_THRESHOLD = 100_000

const COMPARE: FilterOperator[] = ['eq', 'neq', 'in', 'not_in']
const ORDER: FilterOperator[] = ['gt', 'gte', 'lt', 'lte', 'between']
const TEXT: FilterOperator[] = ['contains', 'starts_with', 'ends_with']
const NULLS: FilterOperator[] = ['is_null', 'is_not_null']

/** Operators offered for each column kind. Anything outside this list is rejected by the server. */
export const OPERATORS_BY_KIND: Record<ColumnKind, FilterOperator[]> = {
  number: [...COMPARE, ...ORDER, ...NULLS],
  string: [...COMPARE, ...ORDER, ...TEXT, ...NULLS],
  uuid: [...COMPARE, ...TEXT, ...NULLS],
  enum: [...COMPARE, ...NULLS],
  date: [...COMPARE, ...ORDER, ...NULLS],
  datetime: [...COMPARE, ...ORDER, ...NULLS],
  time: [...COMPARE, ...ORDER, ...NULLS],
  boolean: ['is_true', 'is_false', ...NULLS],
  json: NULLS,
  binary: NULLS,
  array: NULLS,
  other: [...COMPARE, ...ORDER, ...TEXT, ...NULLS],
}

/** How many values an operator takes: none, one scalar, a list, or exactly two. */
export function operatorArity(op: FilterOperator): 'none' | 'scalar' | 'list' | 'pair' {
  if (NULLS.includes(op) || op === 'is_true' || op === 'is_false') return 'none'
  if (op === 'in' || op === 'not_in') return 'list'
  if (op === 'between') return 'pair'
  return 'scalar'
}

/** A binary value as the client receives it: a base64 head of the bytes plus the real size. */
export interface BinaryPreview {
  $binary: string
  size: number
  truncated: boolean
}

export interface RowsRequest {
  schema: string
  filter: FilterNode | null
  sort: SortItem[]
  limit: number
  offset: number
  /** Subset of columns to read. Omitted means all of them. */
  columns?: string[]
}

export interface CountRequest {
  schema: string
  filter: FilterNode | null
  /** `false` allows an estimate for large tables; `true` always counts. */
  exact: boolean
}

export interface RowsResponse {
  rows: Record<string, unknown>[]
}

export interface CountResponse {
  count: number
  /** False when `count` is the catalogue estimate (table too large for an exact count). */
  exact: boolean
}

/** A validated read, ready to be compiled by a driver. Built by `planRows` on the server. */
export interface RowsPlan {
  dialect: SchemaSnapshot['dialect']
  schema: string
  table: string
  primaryKey: string[]
  columns: string[] | null
  filter: FilterNode | null
  /** Requested sort followed by the primary key, so pagination is stable. */
  sort: SortItem[]
  limit: number
  offset: number
}

/** Per-table grid preferences: column widths in px and the columns the user hid. Stored in `preferences`. */
export interface GridPrefs {
  widths: Record<string, number>
  hidden: string[]
  /** Column names in display order. Columns not listed keep their table order, after the listed ones. */
  order: string[]
  /** Pinned columns stay on the left, in `order`. */
  pinned: string[]
}

export interface BlobRequest {
  schema: string
  column: string
  /** Primary key of the row, column name to value. */
  key: Record<string, string | number>
}
