import { run } from '../../connections/http'
import { clearHistory } from '../../query/saved-queries-service'
import { useStore } from '../../store/db'

/** Clears the history, of one connection (`?connectionId=`) or all of it. */
export default defineEventHandler(async (event) => {
  const { connectionId } = getQuery(event)
  const removed = await run(() => clearHistory(useStore(), typeof connectionId === 'string' ? connectionId : undefined))
  return { removed }
})
