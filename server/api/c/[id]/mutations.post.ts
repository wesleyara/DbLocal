import type { MutationResponse } from '#shared/types/mutations'
import { mutationRequestSchema } from '#shared/schemas/mutations'
import { run, parseBody } from '../../../connections/http'
import { applyMutations } from '../../../query/mutations-service'
import { useStore } from '../../../store/db'

/** Inserts, updates and deletes of one schema in a single transaction (`dryRun` only compiles). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = parseBody(mutationRequestSchema, await readBody(event))
  return run(async (): Promise<MutationResponse> => applyMutations(useStore(), id, body))
})
