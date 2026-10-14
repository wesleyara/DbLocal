import { run } from '../../../../connections/http'
import { deleteVirtualRelation } from '../../../../schema/virtual-relations'
import { useStore } from '../../../../store/db'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const rid = getRouterParam(event, 'rid')!
  return run(async () => {
    if (!(await deleteVirtualRelation(useStore(), id, rid))) {
      throw createError({ statusCode: 404, statusMessage: 'Virtual relation not found' })
    }
    setResponseStatus(event, 204)
    return null
  })
})
