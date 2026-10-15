import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'

process.env.DBLOCAL_PASSWORD = 'hunter2'
process.env.DBLOCAL_DATA_DIR = mkdtempSync(join(tmpdir(), 'dbl-auth-'))

const login = (password: string) =>
  fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  })

describe('with DBLOCAL_PASSWORD', async () => {
  await setup({ rootDir: process.cwd(), server: true, build: true })

  it('redirects pages to /login and 401s the API', async () => {
    const page = await fetch('/', { redirect: 'manual' })
    expect(page.status).toBe(302)
    expect(page.headers.get('location')).toBe('/login')
    expect((await fetch('/api/auth/status')).status).toBe(401)
  })

  it('keeps the health probe public', async () => {
    const res = await fetch('/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('rejects a wrong password and accepts the right one with a strict httpOnly cookie', async () => {
    expect((await login('nope')).status).toBe(401)
    const ok = await login('hunter2')
    expect(ok.status).toBe(200)
    const cookie = ok.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Strict/i)
    const session = cookie.split(';')[0]!
    const authed = await fetch('/api/auth/status', { headers: { cookie: session } })
    expect(authed.status).toBe(200)
  })

  it('blocks repeated attempts', async () => {
    const codes: number[] = []
    for (let i = 0; i < 8; i++) codes.push((await login('bad')).status)
    expect(codes).toContain(429)
  })
})
