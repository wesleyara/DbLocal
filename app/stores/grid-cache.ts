import { defineStore } from 'pinia'
import { GridCache } from '#shared/grid-cache'

/**
 * Last state of every grid, per workspace tab, in memory only (see `shared/grid-cache.ts`). Coming
 * back to a view shows what was loaded, without asking the database again; reloading (⌘R, after a
 * save, after a SQL write) is the only way to refresh it. A save anywhere bumps the pending
 * store's `version`, which drops all cached data, since a save may touch any table. Tabs that
 * were closed lose their entries.
 */
export const useGridCacheStore = defineStore('grid-cache', () => {
  const cache = new GridCache()
  const pending = usePendingStore()
  const workspace = useWorkspaceStore()

  watch(
    () => pending.version,
    () => cache.clearData(),
  )
  watch(
    () => workspace.tabs.map((tab) => tab.id),
    (ids) => cache.keepTabs(ids),
  )

  return { cache }
})
