import { run } from '../../connections/http'
import { deleteSavedQuery } from '../../query/saved-queries-service'
import { useStore } from '../../store/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await run(() => deleteSavedQuery(useStore(), id))
  return { ok: true }
})
