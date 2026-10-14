import { blobRequestSchema } from '#shared/schemas/rows'
import { parseBody, run } from '../../../../../connections/http'
import { readBlob } from '../../../../../query/rows-service'
import { useStore } from '../../../../../store/db'

/** Downloads one binary cell as stored (not the grid preview). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const table = getRouterParam(event, 'table')!
  const body = parseBody(blobRequestSchema, await readBody(event))
  return run(async () => {
    const { bytes, name } = await readBlob(useStore(), id, table, body)
    setHeader(event, 'content-type', 'application/octet-stream')
    setHeader(event, 'content-disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"`)
    return Buffer.from(bytes)
  })
})
