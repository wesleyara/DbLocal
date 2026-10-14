import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateStore, openStore } from './db'
import { resolveDataDir } from '../utils/data-dir'

describe('store', () => {
  it('migrates idempotently and creates all tables', async () => {
    const db = openStore(mkdtempSync(join(tmpdir(), 'dbl-')))
    await migrateStore(db)
    await migrateStore(db)
    const names = (await db.introspection.getTables()).map((t) => t.name)
    for (const t of ['connections', 'saved_queries', 'query_history', 'virtual_relations', 'preferences', 'kv']) {
      expect(names).toContain(t)
    }
    await db.destroy()
  })
  it('resolves data dir from env', () => {
    expect(resolveDataDir({ DBLOCAL_DATA_DIR: '/x' })).toBe('/x')
  })
})
