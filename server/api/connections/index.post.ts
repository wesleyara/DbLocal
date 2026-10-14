import { connectionCreateSchema } from '#shared/schemas/connection'
import { parseBody, run } from '../../connections/http'
import { createConnection } from '../../connections/repository'
import { useStore } from '../../store/db'

export default defineEventHandler(async (event) => {
  const input = parseBody(connectionCreateSchema, await readBody(event))
  setResponseStatus(event, 201)
  return run(() => createConnection(useStore(), input))
})
