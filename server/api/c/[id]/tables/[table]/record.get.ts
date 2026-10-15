import type { RecordResponse } from '#shared/types/relations'
import { recordKeySchema } from '#shared/schemas/rows'
import { run } from '../../../../../connections/http'
import { readRecord } from '../../../../../query/relations-service'
import { useStore } from '../../../../../store/db'

/** One full record plus its resolved relations. `pk` is the key as JSON: `{"id":42}`. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const table = getRouterParam(event, 'table')!
  const { schema, pk } = getQuery(event)
  if (typeof schema !== 'string' || !schema || typeof pk !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'schema and pk are required' })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(pk)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'pk must be JSON' })
  }
  const key = recordKeySchema.safeParse(parsed)
  if (!key.success) throw createError({ statusCode: 400, statusMessage: 'Invalid pk' })
  return run(async (): Promise<RecordResponse> => readRecord(useStore(), id, table, schema, key.data))
})
