import type { RoutinesResponse } from '#shared/types/routines'
import { getConnection } from '../../../connections/repository'
import { run } from '../../../connections/http'
import { connectionDriver, defaultSchemaOf } from '../../../schema/service'
import { useStore } from '../../../store/db'

/** Functions, procedures and triggers of a schema with their definitions. `?schema=` defaults to the connection's. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const requested = getQuery(event).schema
  return run(async (): Promise<RoutinesResponse> => {
    const db = useStore()
    const view = await getConnection(db, id)
    const schema =
      (typeof requested === 'string' && requested) || defaultSchemaOf(view.dialect, view.defaultSchema, view.database)
    if (!schema) throw createError({ statusCode: 400, statusMessage: 'schema is required' })
    const snapshot = await (await connectionDriver(db, id)).listRoutines(schema)
    return { dialect: view.dialect, schema, ...snapshot }
  })
})
