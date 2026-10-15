import type { Kysely } from 'kysely'
import type { MutationRequest, MutationResponse } from '#shared/types/mutations'
import { getConnection } from '../connections/repository'
import { DriverError } from '../drivers/errors'
import { connectionDriver, readSchema } from '../schema/service'
import type { StoreSchema } from '../store/db'
import { globalReadonly } from '../utils/readonly'
import { previewStatements } from './compile-mutations'
import { planMutations } from './mutation-plan'
import { serializeRow } from './serialize'

type Db = Kysely<StoreSchema>

/**
 * Applies a batch of inserts, updates and deletes in one transaction. Read-only connections (their
 * own flag, or `DBLOCAL_READONLY`) refuse with 403 before anything is validated. With `dryRun` the
 * batch is validated and compiled, and the SQL is returned without touching the database.
 */
export async function applyMutations(db: Db, connectionId: string, req: MutationRequest): Promise<MutationResponse> {
  const connection = await getConnection(db, connectionId)
  if (connection.readonly || globalReadonly()) throw new DriverError('permission', 'This connection is read-only')

  const { snapshot } = await readSchema(db, connectionId, req.schema)
  const plan = planMutations(snapshot, req.ops)
  const statements = previewStatements(plan)
  if (req.dryRun) return { dryRun: true, statements, results: [] }

  const driver = await connectionDriver(db, connectionId)
  const results = await driver.applyMutations(plan)
  return {
    dryRun: false,
    statements,
    results: results.map((r) => ({ ...r, row: r.row ? serializeRow(r.row) : null })),
  }
}

