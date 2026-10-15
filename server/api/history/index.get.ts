import { historyQuerySchema } from '#shared/schemas/saved-queries'
import { parseBody, run } from '../../connections/http'
import { getHistoryRetention, listHistory } from '../../query/saved-queries-service'
import { useStore } from '../../store/db'

/** Query history, newest first. Filters: `q` (text in the SQL), `connectionId`, `status`. */
export default defineEventHandler(async (event) => {
  const query = parseBody(historyQuerySchema, getQuery(event))
  return run(async () => {
    const db = useStore()
    return { ...(await listHistory(db, query)), retention: await getHistoryRetention(db) }
  })
})
