import { run } from '../../../connections/http'
import { duplicateConnection } from '../../../connections/repository'
import { useStore } from '../../../store/db'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  setResponseStatus(event, 201)
  return run(() => duplicateConnection(useStore(), id))
})
