import { connectionUpdateSchema } from '#shared/schemas/connection'
import { parseBody, run } from '../../connections/http'
import { updateConnection } from '../../connections/repository'
import { useStore } from '../../store/db'
import { getPoolManager } from '../../drivers'
import { invalidateSchema } from '../../schema/service'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const patch = parseBody(connectionUpdateSchema, await readBody(event))
  return run(async () => {
    const view = await updateConnection(useStore(), id, patch)
    // Open pools still hold the old settings, so they are closed and rebuilt on next use.
    await getPoolManager().invalidate(id)
    invalidateSchema(id)
    return view
  })
})
