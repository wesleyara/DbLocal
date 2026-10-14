import type { GridPrefs } from '#shared/types/rows'
import { run } from '../../../../../connections/http'
import { getGridPrefs } from '../../../../../query/prefs'
import { useStore } from '../../../../../store/db'

/** Column widths and hidden columns of a table (`?schema=`). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const table = getRouterParam(event, 'table')!
  const schema = String(getQuery(event).schema ?? '')
  return run(async (): Promise<GridPrefs> => getGridPrefs(useStore(), id, schema, table))
})
