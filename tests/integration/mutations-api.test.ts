import Database from 'better-sqlite3'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

delete process.env.DBLOCAL_PASSWORD
delete process.env.DBLOCAL_READONLY
const dataDir = mkdtempSync(join(tmpdir(), 'dbl-mut-'))
process.env.DBLOCAL_DATA_DIR = dataDir

const file = join(dataDir, 'shop.sqlite')
const seed = new Database(file)
seed.exec(`
  create table users (id integer primary key, name text not null);
  insert into users values (1, 'Ana'), (2, 'Bruno');
  create view user_names as select name from users;
`)
seed.close()

const post = (id: string, body: unknown) =>
  fetch(`/api/c/${id}/mutations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('mutations API', async () => {
  await setup({ rootDir: process.cwd(), server: true, build: true })

  const create = (name: string, readonly: boolean) =>
    $fetch<{ id: string }>('/api/connections', {
      method: 'POST',
      body: { name, dialect: 'sqlite', filePath: file, environment: 'local', ssl: { mode: 'disable' }, readonly },
    })

  it('applies a batch, and dryRun returns the SQL without running it', async () => {
    const { id } = await create('rw', false)
    const dry = await (await post(id, { schema: 'main', dryRun: true, ops: [{ type: 'insert', table: 'users', values: { name: 'Carla' } }] })).json()
    expect(dry.dryRun).toBe(true)
    expect(dry.statements[0].sql).toContain('insert into "main"."users"')
    expect(dry.results).toEqual([])
    const before = await $fetch<{ count: number }>(`/api/c/${id}/tables/users/count`, { method: 'POST', body: { schema: 'main', filter: null, exact: true } })
    expect(before.count).toBe(2)

    const ok = await post(id, {
      schema: 'main',
      ops: [
        { type: 'insert', table: 'users', values: { name: 'Carla' } },
        { type: 'update', table: 'users', pk: { id: 1 }, values: { name: 'Ana Souza' } },
      ],
    })
    expect(ok.status).toBe(200)
    const body = await ok.json()
    expect(body.results[0].row).toMatchObject({ name: 'Carla' })
    expect(body.results[1].row).toMatchObject({ id: 1, name: 'Ana Souza' })
  })

  it('rolls back and reports the failing operation by index', async () => {
    const { id } = await create('rw2', false)
    const res = await post(id, {
      schema: 'main',
      ops: [
        { type: 'update', table: 'users', pk: { id: 2 }, values: { name: 'Changed' } },
        { type: 'insert', table: 'users', values: { id: 1, name: 'dup' } },
      ],
    })
    expect(res.status).toBe(409)
    const err = await res.json()
    expect(err.data.errors[0]).toMatchObject({ index: 1, code: 'constraint' })
    const rows = await $fetch<{ rows: { id: number; name: string }[] }>(`/api/c/${id}/tables/users/rows`, {
      method: 'POST',
      body: { schema: 'main', filter: null, sort: [], limit: 10, offset: 0 },
    })
    expect(rows.rows.find((r) => r.id === 2)!.name).toBe('Bruno')
  })

  it('rejects views and unkeyed edits with 400', async () => {
    const { id } = await create('rw3', false)
    const res = await post(id, { schema: 'main', ops: [{ type: 'delete', table: 'user_names', pk: { name: 'Ana' } }] })
    expect(res.status).toBe(400)
  })

  it('refuses writes on a read-only connection with 403', async () => {
    const { id } = await create('ro', true)
    const res = await post(id, { schema: 'main', ops: [{ type: 'insert', table: 'users', values: { name: 'x' } }] })
    expect(res.status).toBe(403)
    const view = await $fetch<{ readonly: boolean; readonlyGlobal: boolean }>(`/api/connections/${id}`)
    expect(view.readonly).toBe(true)
  })
})
