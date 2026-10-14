import type { VirtualRelationDef } from '#shared/types/db'
import { virtualRelationInputSchema } from '#shared/schemas/virtual-relation'
import { parseBody, run } from '../../../../connections/http'
import { checkVirtualRelation } from '../../../../schema/service'
import { issueStatus, updateVirtualRelation } from '../../../../schema/virtual-relations'
import { useStore } from '../../../../store/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const rid = getRouterParam(event, 'rid')!
  const input = parseBody(virtualRelationInputSchema, await readBody(event))
  return run(async (): Promise<VirtualRelationDef> => {
    const db = useStore()
    const issues = await checkVirtualRelation(db, id, input, rid)
    if (issues.length > 0) {
      throw createError({ statusCode: issueStatus(issues), statusMessage: 'Invalid virtual relation', data: { issues } })
    }
    const updated = await updateVirtualRelation(db, id, rid, input)
    if (!updated) throw createError({ statusCode: 404, statusMessage: 'Virtual relation not found' })
    return updated
  })
})
