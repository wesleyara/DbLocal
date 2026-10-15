import type { MutationPlan, MutationResult } from '#shared/types/mutations'
import { compileMutation, reselectPlan } from './compile-mutations'
import { compileRows } from './compile'
import { DriverError } from '../drivers/errors'
import { MutationFailedError } from './errors'
import { DEFAULT_MARK, INCREMENT_MARK } from './mutation-plan'

type Row = Record<string, unknown>

export interface StatementResult {
  rows: Row[]
  affected: number
  /** Last auto-generated key (MySQL `insertId`), when the driver reports one. */
  insertId: string | number | null
}

/** What a driver offers inside an open transaction. Errors are thrown already mapped to `DriverError`. */
export interface TransactionExecutor {
  execute(sql: string, parameters: readonly unknown[]): Promise<StatementResult>
}

const STALE = 'The row was not found: it may have been changed or deleted since it was loaded'

/**
 * Runs a planned batch on an open transaction and returns the per-operation results. The caller
 * (the driver) owns BEGIN / COMMIT / ROLLBACK: any throw from here must roll back. A failing
 * operation is reported as a `MutationFailedError` carrying its index.
 */
export async function runMutations(plan: MutationPlan, tx: TransactionExecutor): Promise<MutationResult[]> {
  const results: MutationResult[] = []
  for (const op of plan.ops) {
    try {
      const compiled = compileMutation(op, plan.dialect, plan.schema)
      const res = await tx.execute(compiled.sql, compiled.parameters)

      if (op.type === 'delete') {
        if (res.affected === 0) throw new DriverError('constraint', STALE)
        results.push({ index: op.index, type: op.type, affected: res.affected, row: null })
        continue
      }
      if (op.type === 'update' && res.affected === 0) throw new DriverError('constraint', STALE)

      let row: Row | null = res.rows[0] ?? null
      if (!compiled.returning) {
        // MySQL: read the row back by its key. Updated key columns take their new value.
        const key: Record<string, unknown> = {}
        const source = op.type === 'update' ? { ...op.pk, ...op.values } : op.values
        for (const column of op.keyColumns) {
          const given = source[column]
          key[column] = given !== undefined && given !== DEFAULT_MARK && given !== INCREMENT_MARK ? given : null
        }
        if (op.type === 'insert' && res.insertId !== null && op.keyColumns.length === 1 && key[op.keyColumns[0]!] === null) {
          key[op.keyColumns[0]!] = res.insertId
        }
        if (op.keyColumns.every((c) => key[c] !== null)) {
          const q = compileRows(reselectPlan(plan.dialect, plan.schema, op.table, op.keyColumns, key))
          row = (await tx.execute(q.sql, q.parameters)).rows[0] ?? null
        }
      }
      results.push({ index: op.index, type: op.type, affected: res.affected, row })
    } catch (err) {
      if (err instanceof MutationFailedError) throw err
      const driverError = err instanceof DriverError ? err : new DriverError('unknown', err instanceof Error ? err.message : String(err), err)
      throw new MutationFailedError(op.index, driverError.code, driverError.message, err)
    }
  }
  return results
}
