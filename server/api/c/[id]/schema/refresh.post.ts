import type { SchemaResponse } from '#shared/types/db'
import { run } from '../../../../connections/http'
import { readSchema, invalidateSchema } from '../../../../schema/service'
import { useStore } from '../../../../store/db'

/** Drops the cached snapshot of the connection and introspects the schema again. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const schema = getQuery(event).schema
  return run(async (): Promise<SchemaResponse> => {
    invalidateSchema(id)
    const view = await readSchema(useStore(), id, typeof schema === 'string' ? schema : undefined, { refresh: true })
    return { snapshot: view.snapshot, graph: view.graph, cached: false }
  })
})
