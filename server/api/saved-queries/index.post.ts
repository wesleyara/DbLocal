import { savedQueryInputSchema } from '#shared/schemas/saved-queries'
import { parseBody, run } from '../../connections/http'
import { createSavedQuery } from '../../query/saved-queries-service'
import { useStore } from '../../store/db'

export default defineEventHandler(async (event) => {
  const body = parseBody(savedQueryInputSchema, await readBody(event))
  return run(() => createSavedQuery(useStore(), body))
})
