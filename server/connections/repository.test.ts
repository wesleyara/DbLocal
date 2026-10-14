import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateStore, openStore } from '../store/db'
import { setSecretKey } from '../utils/secrets'
import { DriverError } from '../drivers/errors'
import {
  createConnection,
  deleteConnection,
  duplicateConnection,
  getConnection,
  listConnections,
  loadDraft,
  updateConnection,
} from './repository'
import type { Kysely } from 'kysely'
import type { StoreSchema } from '../store/db'

let db: Kysely<StoreSchema>

beforeEach(async () => {
  setSecretKey(Buffer.alloc(32, 7))
  db = openStore(mkdtempSync(join(tmpdir(), 'dbl-repo-')))
  await migrateStore(db)
})

afterEach(async () => {
  await db.destroy()
})

const base = {
  name: 'Local shop',
  dialect: 'postgres' as const,
  host: '127.0.0.1',
  port: 54329,
  user: 'dblocal',
  password: 'S3cret-pw-XYZ',
  database: 'dblocal_dev',
  ssl: { mode: 'disable' as const },
  environment: 'local' as const,
  readonly: false,
}

describe('connections repository', () => {
  it('never returns a secret, only has* flags', async () => {
    const view = await createConnection(db, {
      ...base,
      ssl: { mode: 'verify-full', ca: 'CA-PEM' },
      ssh: { enabled: true, host: 'bastion', user: 'ops', authMethod: 'password', password: 'bastion-pw' },
    })
    const json = JSON.stringify(view)
    expect(json).not.toContain('S3cret-pw-XYZ')
    expect(json).not.toContain('CA-PEM')
    expect(json).not.toContain('bastion-pw')
    expect(view).toMatchObject({
      hasPassword: true,
      ssl: { mode: 'verify-full', hasCa: true, hasCert: false, hasKey: false },
      ssh: { enabled: true, hasPassword: true, hasPrivateKey: false },
    })
  })

  it('stores secrets encrypted in the database', async () => {
    const view = await createConnection(db, base)
    const row = await db.selectFrom('connections').selectAll().where('id', '=', view.id).executeTakeFirstOrThrow()
    expect(row.config).not.toContain('S3cret-pw-XYZ')
    expect(row.config).toContain('v1:')
  })

  it('PATCH without a secret keeps it, null removes it, a string replaces it', async () => {
    const view = await createConnection(db, base)

    await updateConnection(db, view.id, { name: 'Renamed' })
    expect((await loadDraft(db, view.id)).password).toBe('S3cret-pw-XYZ')

    await updateConnection(db, view.id, { password: 'new-secret' })
    expect((await loadDraft(db, view.id)).password).toBe('new-secret')

    const cleared = await updateConnection(db, view.id, { password: null })
    expect(cleared.hasPassword).toBe(false)
    expect((await loadDraft(db, view.id)).password).toBeUndefined()
  })

  it('PATCH changes only the fields it sends', async () => {
    const view = await createConnection(db, base)
    const updated = await updateConnection(db, view.id, { environment: 'prod', color: 'danger' })
    expect(updated).toMatchObject({ host: '127.0.0.1', port: 54329, environment: 'prod', color: 'danger' })
    expect(updated.ssl.mode).toBe('disable')
  })

  it('rejects an invalid connection without saving it', async () => {
    await expect(createConnection(db, { ...base, host: undefined })).rejects.toBeInstanceOf(DriverError)
    expect(await listConnections(db)).toHaveLength(0)
  })

  it('rejects a PATCH that would leave an unbuildable connection', async () => {
    const view = await createConnection(db, base)
    // SQLite needs a file path, which the stored postgres connection does not have.
    await expect(updateConnection(db, view.id, { dialect: 'sqlite' })).rejects.toBeInstanceOf(DriverError)
    expect((await getConnection(db, view.id)).dialect).toBe('postgres')
  })

  it('duplicate copies the secrets and gets a new id and name', async () => {
    const view = await createConnection(db, base)
    const copy = await duplicateConnection(db, view.id)
    expect(copy.id).not.toBe(view.id)
    expect(copy.name).toBe('Local shop (copy)')
    expect((await loadDraft(db, copy.id)).password).toBe('S3cret-pw-XYZ')
  })

  it('delete removes the connection', async () => {
    const view = await createConnection(db, base)
    await deleteConnection(db, view.id)
    expect(await listConnections(db)).toHaveLength(0)
  })
})
