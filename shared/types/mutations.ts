import type { SchemaSnapshot } from './db'

/** Marks a column to take its database default (insert) or be reset to it (update). */
export interface DefaultValue {
  $default: true
}

/** A binary value sent by the client: the bytes as base64. */
export interface BinaryValue {
  $binary: string
}

/**
 * One value of a mutation: `null` is SQL NULL, `DefaultValue` is the column default, a
 * `BinaryValue` carries bytes. Everything else is the JSON value of the column.
 */
export type MutationValue = string | number | boolean | null | DefaultValue | BinaryValue | unknown[] | Record<string, unknown>

export type MutationKey = Record<string, string | number>

export type MutationOp =
  | { type: 'insert'; table: string; values: Record<string, MutationValue> }
  | { type: 'update'; table: string; pk: MutationKey; values: Record<string, MutationValue> }
  | { type: 'delete'; table: string; pk: MutationKey }

export interface MutationRequest {
  schema: string
  ops: MutationOp[]
  /** Compile and validate only: returns the SQL and runs nothing. */
  dryRun?: boolean
}

/** One compiled statement, as shown in the "Preview SQL" dialog. */
export interface MutationStatement {
  index: number
  sql: string
  /** Parameters in order, binary values replaced by a `<binary N bytes>` marker. */
  parameters: unknown[]
  /** The statement with its parameters inlined, for reading only (never executed). */
  preview: string
}

export interface MutationResult {
  index: number
  type: MutationOp['type']
  affected: number
  /** The row after an insert or update (`RETURNING`, or a re-select on MySQL). Null for deletes. */
  row: Record<string, unknown> | null
}

export interface MutationResponse {
  dryRun: boolean
  statements: MutationStatement[]
  results: MutationResult[]
}

/** Error body of a failed batch: the whole transaction was rolled back. */
export interface MutationErrorItem {
  index: number
  code: string
  message: string
}

export const MAX_MUTATION_OPS = 1000

/** A validated and coerced operation, ready to be compiled and run by a driver. */
export type PlannedOp =
  | { index: number; type: 'insert'; table: string; keyColumns: string[]; values: Record<string, unknown> }
  | {
      index: number
      type: 'update'
      table: string
      keyColumns: string[]
      pk: Record<string, unknown>
      values: Record<string, unknown>
    }
  | { index: number; type: 'delete'; table: string; keyColumns: string[]; pk: Record<string, unknown> }

export interface MutationPlan {
  dialect: SchemaSnapshot['dialect']
  schema: string
  ops: PlannedOp[]
}
