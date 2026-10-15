import { savedQueryPatchSchema } from '#shared/schemas/saved-queries'
import { parseBody, run } from '../../connections/http'
import { updateSavedQuery } from '../../query/saved-queries-service'
import { useStore } from '../../store/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = parseBody(savedQueryPatchSchema, await readBody(event))
  return run(() => updateSavedQuery(useStore(), id, body))
})
