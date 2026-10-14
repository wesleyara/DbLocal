import { displayColumnSchema } from '#shared/schemas/virtual-relation'
import { parseBody, run } from '../../../connections/http'
import { setDisplayColumn } from '../../../schema/virtual-relations'
import { useStore } from '../../../store/db'

/** Sets (or with `column: null` clears) the display column of one table. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const input = parseBody(displayColumnSchema, await readBody(event))
  return run(async () => {
    await setDisplayColumn(useStore(), id, input.schema, input.table, input.column)
    return null
  })
})
