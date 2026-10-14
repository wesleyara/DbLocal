import type { SchemaResponse } from '#shared/types/db'
import { run } from '../../../connections/http'
import { readSchema } from '../../../schema/service'
import { useStore } from '../../../store/db'

/** The schema snapshot and its relation graph. `?schema=` picks the schema, defaulting to the connection's. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const schema = getQuery(event).schema
  return run(async (): Promise<SchemaResponse> => {
    const view = await readSchema(useStore(), id, typeof schema === 'string' ? schema : undefined)
    return { snapshot: view.snapshot, graph: view.graph, cached: view.cached }
  })
})
