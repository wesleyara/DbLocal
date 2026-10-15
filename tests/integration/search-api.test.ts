import Database from 'better-sqlite3'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

delete process.env.DBLOCAL_PASSWORD
delete process.env.DBLOCAL_READONLY
const dataDir = mkdtempSync(join(tmpdir(), 'dbl-search-'))
process.env.DBLOCAL_DATA_DIR = dataDir

const file = join(dataDir, 'shop.sqlite')
const seed = new Database(file)
seed.exec(`
  create table users (id integer primary key, email text not null);
  insert into users values (1, 'ana@example.com'), (2, 'bruno@example.com');
  create table notes (id integer primary key, body text);
  insert into notes values (1, 'call ana@example.com tomorrow');
`)
seed.close()

const post = (path: string, body: unknown) =>
  fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('global search API', async () => {
  await setup({ rootDir: process.cwd(), server: true, build: true })

  const create = () =>
    $fetch<{ id: string }>('/api/connections', {
      method: 'POST',
      body: { name: 'search', dialect: 'sqlite', filePath: file, environment: 'local', ssl: { mode: 'disable' }, readonly: false },
    })

  it('streams one NDJSON event per table and a closing event', async () => {
    const { id } = await create()
    const res = await post(`/api/c/${id}/search`, { schema: 'main', term: 'ana@example.com', mode: 'exact' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/x-ndjson')
    const events = (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
    expect(events[0]).toMatchObject({ type: 'start' })
    const users = events.find((e) => e.type === 'table' && e.table === 'users')
    expect(users.rows).toEqual([{ id: 1, email: 'ana@example.com' }])
    // `notes.body` only contains the e-mail: an exact search does not match it.
    expect(events.some((e) => e.type === 'table' && e.table === 'notes')).toBe(false)
    expect(events.at(-1)).toMatchObject({ type: 'done', cancelled: false })
  })

  it('validates the body and unknown connections', async () => {
    const { id } = await create()
    expect((await post(`/api/c/${id}/search`, { schema: 'main', term: '', mode: 'exact' })).status).toBe(400)
    expect((await post(`/api/c/${id}/search`, { schema: 'main', term: 'x', mode: 'fuzzy' })).status).toBe(400)
    expect((await post('/api/c/nope/search', { schema: 'main', term: 'x', mode: 'exact' })).status).toBe(404)
  })
})
