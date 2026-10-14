import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

delete process.env.DBLOCAL_PASSWORD
process.env.DBLOCAL_DATA_DIR = mkdtempSync(join(tmpdir(), 'dbl-api-'))

const body = {
  name: 'Dev Postgres',
  dialect: 'postgres',
  host: '127.0.0.1',
  port: 54329,
  user: 'dblocal',
  password: 'S3cret-api-pw',
  database: 'dblocal_dev',
  environment: 'local',
  ssl: { mode: 'disable' },
}

describe('connections API', async () => {
  await setup({ rootDir: process.cwd(), server: true, build: true })

  it('creates, lists and reads a connection without exposing secrets', async () => {
    const created = await $fetch<{ id: string; hasPassword: boolean }>('/api/connections', { method: 'POST', body })
    expect(created.hasPassword).toBe(true)
    expect(JSON.stringify(created)).not.toContain('S3cret-api-pw')

    const list = await $fetch<{ id: string }[]>('/api/connections')
    expect(list.map((c) => c.id)).toContain(created.id)

    const one = await $fetch<{ id: string }>(`/api/connections/${created.id}`)
    expect(one.id).toBe(created.id)
    expect(JSON.stringify(one)).not.toContain('S3cret-api-pw')
  })

  it('PATCH keeps the password when it is not sent', async () => {
    const created = await $fetch<{ id: string }>('/api/connections', { method: 'POST', body })
    const patched = await $fetch<{ name: string; hasPassword: boolean }>(`/api/connections/${created.id}`, {
      method: 'PATCH',
      body: { name: 'Renamed' },
    })
    expect(patched).toMatchObject({ name: 'Renamed', hasPassword: true })
  })

  it('connect lists the schemas and records the use', async () => {
    const created = await $fetch<{ id: string }>('/api/connections', {
      method: 'POST',
      body: { ...body, password: 'dblocal' },
    })
    const ns = await $fetch<{ dialect: string; namespaces: string[]; system: string[] }>(
      `/api/connections/${created.id}/connect`,
      { method: 'POST' },
    )
    expect(ns.dialect).toBe('postgres')
    expect(ns.namespaces).toContain('public')
    expect(ns.system).toContain('pg_catalog')
    expect(ns.system).not.toContain('public')

    const one = await $fetch<{ lastUsedAt: string | null }>(`/api/connections/${created.id}`)
    expect(one.lastUsedAt).not.toBeNull()
  })

  it('duplicate and delete', async () => {
    const created = await $fetch<{ id: string }>('/api/connections', { method: 'POST', body })
    const copy = await $fetch<{ id: string; name: string }>(`/api/connections/${created.id}/duplicate`, {
      method: 'POST',
    })
    expect(copy.name).toBe('Dev Postgres (copy)')

    const res = await fetch(`/api/connections/${copy.id}`, { method: 'DELETE' })
    expect(res.status).toBe(204)
    expect((await fetch(`/api/connections/${copy.id}`)).status).toBe(404)
  })

  it('an invalid body is a 400', async () => {
    const res = await fetch('/api/connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', dialect: 'postgres' }),
    })
    expect(res.status).toBe(400)
  })
})
