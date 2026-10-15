import cuid from 'cuid'
import { createId as cuid2 } from '@paralleldrive/cuid2'
import { nanoid } from 'nanoid'
import { ulid } from 'ulid'
import type { SchemaColumn } from './types/db'

/**
 * Value generators a cell accepts as text: typing `uuid()` in a text column stores a fresh UUID,
 * `now()` in a datetime column stores the current instant. `increment()` is resolved by the server
 * when the batch is saved (it needs the table's current maximum), so it stays a `{ $fn }` marker.
 * Wrap a call in quotes (`"now()"`) to store the text itself.
 */
export type EditFunction = 'uuid' | 'cuid' | 'cuid2' | 'ulid' | 'nanoid' | 'now' | 'increment'

export const EDIT_FUNCTIONS: readonly EditFunction[] = ['uuid', 'cuid', 'cuid2', 'ulid', 'nanoid', 'now', 'increment']

/** Marker the client sends for a value the server computes while saving. */
export interface FunctionValue {
  $fn: 'increment'
}

export const isFunctionValue = (v: unknown): v is FunctionValue =>
  typeof v === 'object' && v !== null && (v as { $fn?: unknown }).$fn === 'increment'

const CALL = /^(uuid|cuid|cuid2|ulid|nanoid|now|increment)\(\)$/i
const QUOTED_CALL = /^"((?:uuid|cuid|cuid2|ulid|nanoid|now|increment)\(\))"$/i

export type FunctionInput = { kind: 'call'; fn: EditFunction } | { kind: 'literal'; text: string }

/** Reads a typed text as a function call, a quoted (escaped) call, or neither. */
export function parseFunctionInput(text: string): FunctionInput | null {
  const t = text.trim()
  const call = CALL.exec(t)
  if (call) return { kind: 'call', fn: call[1]!.toLowerCase() as EditFunction }
  const quoted = QUOTED_CALL.exec(t)
  if (quoted) return { kind: 'literal', text: quoted[1]! }
  return null
}

const TEXT_TYPE = /char|text|string|citext|name/i

/** Which functions make sense for a column, in the order they are suggested. */
export function functionsFor(column: SchemaColumn): EditFunction[] {
  switch (column.kind) {
    case 'uuid':
      return ['uuid']
    case 'string':
      return TEXT_TYPE.test(column.nativeType) ? ['uuid', 'cuid', 'cuid2', 'ulid', 'nanoid', 'now'] : []
    case 'datetime':
    case 'date':
    case 'time':
      return ['now']
    case 'number':
      return column.isGenerated ? [] : ['increment']
    default:
      return []
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The value of a client-side function, shaped for the column (`now()` is a date, time or instant). */
export function generateValue(fn: Exclude<EditFunction, 'increment'>, column: SchemaColumn, now: Date = new Date()): string {
  switch (fn) {
    case 'uuid':
      return crypto.randomUUID()
    case 'cuid':
      return cuid()
    case 'cuid2':
      return cuid2()
    case 'ulid':
      return ulid()
    case 'nanoid':
      return nanoid()
    case 'now':
      if (column.kind === 'date') return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      if (column.kind === 'time') return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
      return now.toISOString()
  }
}
