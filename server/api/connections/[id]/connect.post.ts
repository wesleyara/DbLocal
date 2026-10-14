import type { NamespaceList } from '#shared/types/connection'
import { isSystemNamespace } from '#shared/system-namespaces'
import { buildDriverConfig } from '../../../connections/config'
import { run } from '../../../connections/http'
import { loadDraft, markUsed } from '../../../connections/repository'
import { useStore } from '../../../store/db'
import { createDriver, getPoolManager } from '../../../drivers'

/** Opens (or reuses) the connection's pool, lists its namespaces and records the use. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  return run(async (): Promise<NamespaceList> => {
    const db = useStore()
    const config = buildDriverConfig(await loadDraft(db, id), id)
    const driver = await getPoolManager().get(config, createDriver)
    const databases = await driver.listDatabases()
    const schemas = await driver.listSchemas()
    await markUsed(db, id)

    const namespaces = config.dialect === 'postgres' ? schemas : databases
    return {
      dialect: config.dialect,
      namespaces,
      system: namespaces.filter((n) => isSystemNamespace(config.dialect, n)),
    }
  })
})
