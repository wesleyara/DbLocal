import type { VirtualRelationDef } from '#shared/types/db'
import { run } from '../../../../connections/http'
import { listVirtualRelations } from '../../../../schema/virtual-relations'
import { defaultSchemaOf } from '../../../../schema/service'
import { getConnection } from '../../../../connections/repository'
import { useStore } from '../../../../store/db'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const requested = getQuery(event).schema
  return run(async (): Promise<VirtualRelationDef[]> => {
    const db = useStore()
    const view = await getConnection(db, id)
    const schema = typeof requested === 'string' ? requested : defaultSchemaOf(view.dialect, view.defaultSchema, view.database)
    return listVirtualRelations(db, id, schema)
  })
})
