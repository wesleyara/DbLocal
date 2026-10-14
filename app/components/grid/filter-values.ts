import { OPERATORS_BY_KIND, operatorArity, type FilterCondition, type FilterOperator, type FilterValue } from '#shared/types/rows'
import type { ColumnKind, SchemaColumn } from '#shared/types/db'

/** Numeric columns send numbers, everything else sends the text as typed. */
export function coerceFor(kind: ColumnKind, raw: string): string | number {
  const trimmed = raw.trim()
  return kind === 'number' && trimmed !== '' && !Number.isNaN(Number(trimmed)) ? Number(trimmed) : trimmed
}

/** Builds a condition from the text typed in the inputs. Null when the inputs are not complete. */
export function buildCondition(column: SchemaColumn, op: FilterOperator, first: string, second: string): FilterCondition | null {
  const base = { type: 'condition' as const, column: column.name, op }
  switch (operatorArity(op)) {
    case 'none':
      return base
    case 'scalar':
      return first.trim() === '' ? null : { ...base, value: coerceFor(column.kind, first) }
    case 'list': {
      const items = first.split(',').map((s) => s.trim()).filter((s) => s !== '')
      return items.length === 0 ? null : { ...base, value: items.map((item) => coerceFor(column.kind, item)) }
    }
    case 'pair':
      return first.trim() === '' || second.trim() === ''
        ? null
        : { ...base, value: [coerceFor(column.kind, first), coerceFor(column.kind, second)] }
  }
}

/** The text an inputs form shows for a stored condition: lists comma separated, ranges split in two. */
export function inputsOf(value: FilterValue | undefined): { first: string; second: string } {
  if (Array.isArray(value)) return { first: value.join(', '), second: String(value[1] ?? '') }
  if (value === undefined) return { first: '', second: '' }
  return { first: String(value), second: '' }
}

export function operatorsOf(column: SchemaColumn | undefined): FilterOperator[] {
  return column ? OPERATORS_BY_KIND[column.kind] : []
}

/** `<input type>` for a column: native pickers for dates and times, text otherwise. */
export function inputTypeOf(kind: ColumnKind | undefined): string {
  switch (kind) {
    case 'date':
      return 'date'
    case 'datetime':
      return 'datetime-local'
    case 'time':
      return 'time'
    default:
      return 'text'
  }
}
