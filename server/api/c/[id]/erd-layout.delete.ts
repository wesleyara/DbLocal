import { run } from '../../../connections/http'
import { resetErdLayout } from '../../../erd/layout'
import { useStore } from '../../../store/db'

/** Drops the manual layout (`?schema=`): the ERD goes back to the automatic one. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const schema = String(getQuery(event).schema ?? '')
  return run(async () => {
    await resetErdLayout(useStore(), id, schema)
    return null
  })
})
