import {
  OPERATORS_BY_KIND,
  operatorArity,
  type FilterCondition,
  type FilterNode,
  type RowsPlan,
  type RowsRequest,
  type SortItem,
} from '#shared/types/rows'
import type { SchemaColumn, SchemaSnapshot, SchemaTable } from '#shared/types/db'
import { QueryInputError } from './errors'

const invalid = (message: string) => new QueryInputError(400, message)

/**
 * Checks a row request against the live snapshot and turns it into a plan. Unknown tables, columns
 * or operators are rejected here, so the SQL builder only ever sees names the database has.
 * Values are never checked for SQL: they go to the driver as parameters.
 */
export function planRows(snapshot: SchemaSnapshot, tableName: string, req: RowsRequest): RowsPlan {
  const table = findTable(snapshot, tableName)
  const columns = new Map(table.columns.map((c) => [c.name, c]))

  if (req.columns) {
    for (const name of req.columns) requireColumn(columns, name)
  }
  if (req.filter) validateFilter(req.filter, columns)
  for (const item of req.sort) requireColumn(columns, item.column)

  return {
    dialect: snapshot.dialect,
    schema: snapshot.schema,
    table: table.name,
    primaryKey: table.primaryKey,
    columns: req.columns ?? null,
    filter: req.filter,
    sort: withPrimaryKey(req.sort, table),
    limit: req.limit,
    offset: req.offset,
  }
}

export function findTable(snapshot: SchemaSnapshot, name: string): SchemaTable {
  const table = snapshot.tables.find((t) => t.name === name)
  if (!table) throw new QueryInputError(404, 'Table not found')
  return table
}

function requireColumn(columns: Map<string, SchemaColumn>, name: string): SchemaColumn {
  const column = columns.get(name)
  if (!column) throw invalid(`Unknown column: ${name}`)
  return column
}

function validateFilter(node: FilterNode, columns: Map<string, SchemaColumn>): void {
  if (node.type === 'group') {
    for (const child of node.children) validateFilter(child, columns)
    return
  }
  validateCondition(node, columns)
}

function validateCondition(c: FilterCondition, columns: Map<string, SchemaColumn>): void {
  const column = requireColumn(columns, c.column)
  if (!OPERATORS_BY_KIND[column.kind].includes(c.op)) {
    throw invalid(`Operator ${c.op} is not valid for ${column.kind} column ${c.column}`)
  }
  const value = c.value
  switch (operatorArity(c.op)) {
    case 'none':
      if (value !== undefined) throw invalid(`Operator ${c.op} takes no value`)
      return
    case 'scalar':
      if (value === undefined || value === null || Array.isArray(value)) {
        throw invalid(`Operator ${c.op} needs one value`)
      }
      return
    case 'list':
      if (!Array.isArray(value) || value.length === 0) throw invalid(`Operator ${c.op} needs a list of values`)
      return
    case 'pair':
      if (!Array.isArray(value) || value.length !== 2) throw invalid(`Operator ${c.op} needs two values`)
      return
  }
}

/** Appends the primary key to the sort so pages never overlap, even when the requested sort has ties. */
function withPrimaryKey(sort: SortItem[], table: SchemaTable): SortItem[] {
  const used = new Set(sort.map((s) => s.column))
  const tail = table.primaryKey.filter((k) => !used.has(k)).map((column) => ({ column, direction: 'asc' as const }))
  return [...sort, ...tail]
}
