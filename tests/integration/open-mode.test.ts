import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

delete process.env.DBLOCAL_PASSWORD
process.env.DBLOCAL_DATA_DIR = mkdtempSync(join(tmpdir(), 'dbl-open-'))

describe('no DBLOCAL_PASSWORD', async () => {
  await setup({ rootDir: process.cwd(), server: true, build: true })

  it('serves pages and API freely', async () => {
    expect((await fetch('/')).status).toBe(200)
    const status = await $fetch<{ authEnabled: boolean }>('/api/auth/status')
    expect(status.authEnabled).toBe(false)
  })

  it('rejects cross-origin mutations', async () => {
    const res = await fetch('/api/auth/logout', { method: 'POST', headers: { origin: 'http://evil.test' } })
    expect(res.status).toBe(403)
  })
})
