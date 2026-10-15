import type { ResolveResponse } from '#shared/types/relations'
import { resolveRequestSchema } from '#shared/schemas/rows'
import { run, parseBody } from '../../../../../../connections/http'
import { resolveRelationsView } from '../../../../../../query/relations-service'
import { useStore } from '../../../../../../store/db'

/** Parents and related-record counts for a batch of rows (the visible ones), in one query per relation. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const table = getRouterParam(event, 'table')!
  const body = parseBody(resolveRequestSchema, await readBody(event))
  return run(async (): Promise<ResolveResponse> => resolveRelationsView(useStore(), id, table, body))
})
