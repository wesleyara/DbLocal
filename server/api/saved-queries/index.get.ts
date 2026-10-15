import { listSavedQueries } from '../../query/saved-queries-service'
import { useStore } from '../../store/db'

/** Saved queries; `?connectionId=` keeps those of that connection plus the global ones. */
export default defineEventHandler(async (event) => {
  const { connectionId } = getQuery(event)
  return listSavedQueries(useStore(), typeof connectionId === 'string' ? connectionId : undefined)
})
