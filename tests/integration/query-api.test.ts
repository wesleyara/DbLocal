import Database from 'better-sqlite3'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

delete process.env.DBLOCAL_PASSWORD
delete process.env.DBLOCAL_READONLY
const dataDir = mkdtempSync(join(tmpdir(), 'dbl-query-'))
process.env.DBLOCAL_DATA_DIR = dataDir

const file = join(dataDir, 'shop.sqlite')
const seed = new Database(file)
seed.exec(`
  create table users (id integer primary key, name text not null);
  insert into users values (1, 'Ana'), (2, 'Bruno');
`)
seed.close()

const post = (path: string, body: unknown) =>
  fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('raw query API', async () => {
  await setup({ rootDir: process.cwd(), server: true, build: true })

  const create = (name: string, extra: Record<string, unknown> = {}) =>
    $fetch<{ id: string }>('/api/connections', {
      method: 'POST',
      body: { name, dialect: 'sqlite', filePath: file, environment: 'local', ssl: { mode: 'disable' }, readonly: false, ...extra },
    })

  it('runs a multi-statement script and returns one result per statement', async () => {
    const { id } = await create('q1')
    const res = await post(`/api/c/${id}/query`, { sql: "select id, name from users order by id; select count(*) as n from users", schema: 'main' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.statements).toHaveLength(2)
    expect(body.statements[0].rows).toEqual([{ id: 1, name: 'Ana' }, { id: 2, name: 'Bruno' }])
    expect(body.statements[1].rows).toEqual([{ n: 2 }])
    expect(typeof body.queryId).toBe('string')
  })

  it('refuses writes on a read-only connection with 403', async () => {
    const { id } = await create('q-ro', { readonly: true })
    const res = await post(`/api/c/${id}/query`, { sql: "insert into users values (9, 'X')" })
    expect(res.status).toBe(403)
    expect((await res.json()).data.code).toBe('permission')
  })

  it('asks for confirmation on prod', async () => {
    const { id } = await create('q-prod', { environment: 'prod' })
    const refused = await post(`/api/c/${id}/query`, { sql: "insert into users values (7, 'Z')" })
    expect(refused.status).toBe(409)
    expect((await refused.json()).data).toMatchObject({ code: 'confirmation_required' })
    const ok = await post(`/api/c/${id}/query`, { sql: "insert into users values (7, 'Z')", confirmWrites: true })
    expect(ok.status).toBe(200)
  })

  it('validates the body and answers cancel for an unknown query', async () => {
    const { id } = await create('q-bad')
    expect((await post(`/api/c/${id}/query`, { sql: '' })).status).toBe(400)
    const cancel = await post(`/api/c/${id}/query/not-running-1/cancel`, {})
    expect(await cancel.json()).toEqual({ cancelled: false })
  })
})
