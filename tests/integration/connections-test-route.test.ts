import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

delete process.env.DBLOCAL_PASSWORD
process.env.DBLOCAL_DATA_DIR = mkdtempSync(join(tmpdir(), 'dbl-test-route-'))

const PG_PASSWORD = 'dblocal'

describe('POST /api/connections/test', async () => {
  await setup({ rootDir: process.cwd(), server: true, build: true })

  it('returns version and latency for a working postgres config', async () => {
    const result = await $fetch<{ serverVersion: string; latencyMs: number }>('/api/connections/test', {
      method: 'POST',
      body: { dialect: 'postgres', host: '127.0.0.1', port: 54329, user: 'dblocal', password: PG_PASSWORD, database: 'dblocal_dev' },
    })
    expect(result.serverVersion).toMatch(/PostgreSQL/)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('never echoes the password back', async () => {
    const res = await fetch('/api/connections/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dialect: 'postgres', host: '127.0.0.1', port: 54329, user: 'dblocal', password: 'wrong-secret', database: 'dblocal_dev' }),
    })
    expect(res.status).toBe(401)
    expect(await res.text()).not.toContain('wrong-secret')
  })

  it('maps an unknown host to 502 with a normalised code', async () => {
    const res = await fetch('/api/connections/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dialect: 'mysql', host: 'no-such-host.invalid', port: 33069, user: 'dblocal', password: 'x' }),
    })
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ data: { code: 'network' } })
  })

  it('rejects an incomplete config with 400', async () => {
    const res = await fetch('/api/connections/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dialect: 'postgres' }),
    })
    expect(res.status).toBe(400)
  })
})
