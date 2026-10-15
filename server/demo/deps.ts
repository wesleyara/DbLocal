import { getPoolManager } from '../drivers'
import { invalidateSchema } from '../schema/service'
import { useStore } from '../store/db'
import { ensureDataDir } from '../utils/data-dir'
import type { DemoDeps } from './demo-service'

/** Wires the demo service to the running server: the store, the data dir and the bundled seed. */
export function demoDeps(): DemoDeps {
  return {
    db: useStore(),
    dataDir: ensureDataDir(),
    seedSql: async () => {
      const sql = await useStorage('assets:seed').getItem<string>('demo.sql')
      if (typeof sql !== 'string') throw createError({ statusCode: 500, statusMessage: 'Demo seed is not bundled' })
      return sql
    },
    release: async (id) => {
      await getPoolManager().invalidate(id)
      invalidateSchema(id)
    },
  }
}
