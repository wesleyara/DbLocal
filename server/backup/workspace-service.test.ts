import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createConnection, loadDraft } from '../connections/repository'
import { migrateStore, openStore, type StoreSchema } from '../store/db'
import { setSecretKey } from '../utils/secrets'
import { exportWorkspace, importWorkspace, WorkspaceBackupError } from './workspace-service'

let dir: string
let source: Kysely<StoreSchema>
let target: Kysely<StoreSchema>
let connId: string

const pg = {
  name: 'prod pg',
  dialect: 'postgres' as const,
  host: 'db.internal',
  port: 5432,
  user: 'app',
  password: 's3cret!',
  database: 'app',
  ssl: { mode: 'disable' as const },
  environment: 'prod' as const,
  readonly: false,
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dbl-ws-'))
  mkdirSync(join(dir, 'a'))
  mkdirSync(join(dir, 'b'))
  source = openStore(join(dir, 'a'))
  target = openStore(join(dir, 'b'))
  await migrateStore(source)
  await migrateStore(target)
  setSecretKey(Buffer.alloc(32, 1))
  connId = (await createConnection(source, pg)).id
  await source.insertInto('saved_queries').values({ id: 'q1', connection_id: connId, name: 'Top', sql: 'select 1', folder: null, created_at: 'x', updated_at: 'x' }).execute()
  await source.insertInto('preferences').values({ key: `notes|${connId}`, value: '{"content":"hi"}' }).execute()
})

afterAll(async () => {
  await source.destroy()
  await target.destroy()
  rmSync(dir, { recursive: true, force: true })
})

describe('workspace backup', () => {
  it('moves secrets to another installation through the password', async () => {
    setSecretKey(Buffer.alloc(32, 1))
    const backup = await exportWorkspace(source, { password: 'correct horse', history: false })
    expect(JSON.stringify(backup)).not.toContain('s3cret!')
    expect(backup.history).toBeNull()

    setSecretKey(Buffer.alloc(32, 2))
    await expect(importWorkspace(target, backup, 'wrong password')).rejects.toBeInstanceOf(WorkspaceBackupError)
    await expect(importWorkspace(target, backup)).rejects.toMatchObject({ code: 'password' })
    const result = await importWorkspace(target, backup, 'correct horse')
    expect(result).toMatchObject({ connections: 1, savedQueries: 1, preferences: 1, withoutSecrets: 0 })
    expect((await loadDraft(target, connId)).password).toBe('s3cret!')

    // Importing again replaces by id instead of duplicating, and keeps what only this side has.
    await target.insertInto('saved_queries').values({ id: 'local', connection_id: connId, name: 'Mine', sql: 'select 2', folder: null, created_at: 'x', updated_at: 'x' }).execute()
    await importWorkspace(target, backup, 'correct horse')
    expect((await target.selectFrom('connections').selectAll().execute()).length).toBe(1)
    expect((await target.selectFrom('saved_queries').select('id').orderBy('id').execute()).map((q) => q.id)).toEqual(['local', 'q1'])
  })

  it('leaves secrets out without a password', async () => {
    setSecretKey(Buffer.alloc(32, 1))
    const backup = await exportWorkspace(source, { history: true })
    expect(backup.kdf).toBeNull()
    expect(JSON.parse(String(backup.connections[0]!.config)).secrets).toEqual({})
    setSecretKey(Buffer.alloc(32, 2))
    const result = await importWorkspace(target, backup)
    expect(result.withoutSecrets).toBe(1)
    expect((await loadDraft(target, connId)).password).toBeUndefined()
  })
})
