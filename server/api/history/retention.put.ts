import { z } from 'zod'
import { parseBody, run } from '../../connections/http'
import { setHistoryRetention } from '../../query/saved-queries-service'
import { useStore } from '../../store/db'

const schema = z.object({ retention: z.number().int().min(10).max(100_000) })

/** How many history entries are kept (the newest ones). */
export default defineEventHandler(async (event) => {
  const { retention } = parseBody(schema, await readBody(event))
  return run(async () => ({ retention: await setHistoryRetention(useStore(), retention) }))
})
