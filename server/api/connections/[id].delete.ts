import { run } from '../../connections/http'
import { deleteConnection } from '../../connections/repository'
import { useStore } from '../../store/db'
import { getPoolManager } from '../../drivers'
import { invalidateSchema } from '../../schema/service'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  return run(async () => {
    await deleteConnection(useStore(), id)
    await getPoolManager().invalidate(id)
    invalidateSchema(id)
    setResponseStatus(event, 204)
    return null
  })
})
