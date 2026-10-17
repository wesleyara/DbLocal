import { functionsFor, generateValue, isFunctionValue, parseFunctionInput, type FunctionValue } from './edit-functions'
import type { SchemaColumn } from './types/db'

export type ParsedInput = { ok: true; value: unknown } | { ok: false; error: 'function' | 'number' | 'integer' | 'json' | 'array' | 'date' | 'datetime' | 'time' | 'uuid' }

const NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/
const INTEGER = /^[+-]?\d+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** Integer column types: the editor then rejects a decimal point. */
export function isIntegerType(column: SchemaColumn): boolean {
  return /int|serial/i.test(column.nativeType) && !/point|interval/i.test(column.nativeType)
}

/** A `Date` as `YYYY-MM-DDTHH:mm:ss` in the viewer's time zone, the format of `<input type="datetime-local">`. */
export function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** The text an editor starts with for the current value of a cell. */
export function toInputText(column: SchemaColumn, value: unknown): string {
  if (value === null || value === undefined) return ''
  if (isFunctionValue(value)) return `${value.$fn}()`
  if (column.kind === 'json' || column.kind === 'array') {
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  }
  if (column.kind === 'datetime') {
    const d = new Date(String(value))
    return Number.isNaN(d.getTime()) ? String(value) : toLocalInput(d)
  }
  if (column.kind === 'date') return String(value).slice(0, 10)
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/**
 * Turns what the user typed into the value to store, or says why it is not valid for the column.
 * An empty number / date / time is NULL (the editors have no other way to clear them).
 */
export function parseInput(column: SchemaColumn, text: string): ParsedInput {
  const fn = parseFunctionInput(text)
  if (fn?.kind === 'literal') return parsePlain(column, fn.text)
  if (fn?.kind === 'call') {
    if (!functionsFor(column).includes(fn.fn)) return { ok: false, error: 'function' }
    if (fn.fn === 'increment') return { ok: true, value: { $fn: 'increment' } satisfies FunctionValue }
    return { ok: true, value: generateValue(fn.fn, column) }
  }
  return parsePlain(column, text)
}

function parsePlain(column: SchemaColumn, text: string): ParsedInput {
  switch (column.kind) {
    case 'number': {
      const t = text.trim()
      if (t === '') return { ok: true, value: null }
      if (isIntegerType(column) ? !INTEGER.test(t) : !NUMERIC.test(t)) return { ok: false, error: isIntegerType(column) ? 'integer' : 'number' }
      const n = Number(t)
      // Past 2^53 a JS number would round; the digits go to the server as text instead.
      return { ok: true, value: Number.isSafeInteger(n) || !INTEGER.test(t) ? n : t.replace(/^\+/, '') }
    }
    case 'json': {
      if (text.trim() === '') return { ok: true, value: null }
      try {
        return { ok: true, value: JSON.parse(text) as unknown }
      } catch {
        return { ok: false, error: 'json' }
      }
    }
    case 'array': {
      if (text.trim() === '') return { ok: true, value: null }
      try {
        const parsed = JSON.parse(text) as unknown
        return Array.isArray(parsed) ? { ok: true, value: parsed } : { ok: false, error: 'array' }
      } catch {
        return { ok: false, error: 'array' }
      }
    }
    case 'date': {
      const t = text.trim()
      if (t === '') return { ok: true, value: null }
      // Date rolls 30 February over to March, so the day has to survive a round trip.
      const d = new Date(`${t}T00:00:00Z`)
      return DATE.test(t) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t
        ? { ok: true, value: t }
        : { ok: false, error: 'date' }
    }
    case 'time': {
      const t = text.trim()
      if (t === '') return { ok: true, value: null }
      return TIME.test(t) ? { ok: true, value: t } : { ok: false, error: 'time' }
    }
    case 'datetime': {
      const t = text.trim()
      if (t === '') return { ok: true, value: null }
      // Typed or picked in the viewer's time zone; stored as the instant (ISO, UTC).
      if (LOCAL_DATETIME.test(t)) {
        const d = new Date(t.replace(' ', 'T'))
        return Number.isNaN(d.getTime()) ? { ok: false, error: 'datetime' } : { ok: true, value: d.toISOString() }
      }
      const d = new Date(t)
      return Number.isNaN(d.getTime()) ? { ok: false, error: 'datetime' } : { ok: true, value: d.toISOString() }
    }
    case 'uuid': {
      const t = text.trim()
      if (t === '') return { ok: true, value: null }
      return UUID.test(t) ? { ok: true, value: t } : { ok: false, error: 'uuid' }
    }
    default:
      return { ok: true, value: text }
  }
}

/** The next value of a boolean cell when it is toggled: true → false → NULL (when nullable) → true. */
export function nextBoolean(current: unknown, nullable: boolean): boolean | null {
  const on = current === true || current === 1 || current === '1' || current === 't' || current === 'true'
  if (current === null || current === undefined) return true
  if (on) return false
  return nullable ? null : true
}

/** Whether the grid lets this column be typed into inline. Binary can only be set to NULL or DEFAULT. */
export function isTextEditable(column: SchemaColumn): boolean {
  return !column.isGenerated && column.kind !== 'binary'
}

const TEXT_TYPE = /char|text|uuid|string/i

/**
 * Whether a new row must be given this primary key by the client: a text or uuid key the database
 * does not fill by itself (no default, not identity). Prisma, for one, generates `cuid()` / `uuid()`
 * ids in its client, so the column has no default and an insert without a value would be NULL.
 * Nothing fills it automatically: the user types a value or a function (`uuid()`, `cuid()`, ...).
 */
export function needsGeneratedKey(column: SchemaColumn): boolean {
  return (
    column.isPrimaryKey &&
    !column.isGenerated &&
    column.default === null &&
    (column.kind === 'uuid' || (column.kind === 'string' && TEXT_TYPE.test(column.nativeType)))
  )
}
