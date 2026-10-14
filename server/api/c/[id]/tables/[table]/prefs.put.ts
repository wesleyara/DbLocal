import { gridPrefsRequestSchema } from '#shared/schemas/rows'
import { parseBody, run } from '../../../../../connections/http'
import { setGridPrefs } from '../../../../../query/prefs'
import { useStore } from '../../../../../store/db'

/** Saves the grid preferences of a table. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const table = getRouterParam(event, 'table')!
  const body = parseBody(gridPrefsRequestSchema, await readBody(event))
  return run(async () => {
    await setGridPrefs(useStore(), id, body.schema, table, body.prefs)
    return null
  })
})
