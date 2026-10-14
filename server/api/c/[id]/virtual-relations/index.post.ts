import type { VirtualRelationDef } from '#shared/types/db'
import { virtualRelationInputSchema } from '#shared/schemas/virtual-relation'
import { parseBody, run } from '../../../../connections/http'
import { checkVirtualRelation } from '../../../../schema/service'
import { createVirtualRelation, issueStatus } from '../../../../schema/virtual-relations'
import { useStore } from '../../../../store/db'

/** Declares a relation with no physical FK. Columns and types are checked against the live snapshot first. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const input = parseBody(virtualRelationInputSchema, await readBody(event))
  return run(async (): Promise<VirtualRelationDef> => {
    const db = useStore()
    const issues = await checkVirtualRelation(db, id, input)
    if (issues.length > 0) {
      throw createError({ statusCode: issueStatus(issues), statusMessage: 'Invalid virtual relation', data: { issues } })
    }
    setResponseStatus(event, 201)
    return createVirtualRelation(db, id, input)
  })
})
