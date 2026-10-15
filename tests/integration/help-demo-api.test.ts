import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

delete process.env.DBLOCAL_PASSWORD
delete process.env.DBLOCAL_READONLY
process.env.DBLOCAL_DATA_DIR = mkdtempSync(join(tmpdir(), 'dbl-help-'))

interface Meta {
  slug: string
  title: string
}
interface Conn {
  id: string
  demo: boolean
  dialect: string
}

describe('help and demo API (built app)', async () => {
  await setup({ rootDir: process.cwd(), server: true, build: true })

  it('serves the bundled articles in both locales, with the same slugs', async () => {
    const en = await $fetch<Meta[]>('/api/help', { query: { locale: 'en' } })
    const pt = await $fetch<Meta[]>('/api/help', { query: { locale: 'pt-BR' } })
    expect(en.map((a) => a.slug).sort()).toEqual(pt.map((a) => a.slug).sort())
    expect(en.map((a) => a.slug)).toContain('getting-started')
    expect(pt.find((a) => a.slug === 'getting-started')?.title).not.toBe(en.find((a) => a.slug === 'getting-started')?.title)
  })

  it('renders an article with headings, anchors and the body in HTML', async () => {
    const article = await $fetch<{ html: string; headings: { id: string }[] }>('/api/help/connections', { query: { locale: 'en' } })
    expect(article.html).toContain('id="ssh-tunnel"')
    expect(article.headings.map((h) => h.id)).toContain('ssl')
    const missing = await fetch('/api/help/does-not-exist')
    expect(missing.status).toBe(404)
  })

  it('finds an article by a word of its body', async () => {
    const hits = await $fetch<{ slug: string; snippet: string }[]>('/api/help/search', { query: { q: 'tunnel', locale: 'en' } })
    expect(hits.map((h) => h.slug)).toContain('connections')
  })

  it('creates the demo once, restores it on reset and keeps a single connection', async () => {
    const first = await $fetch<Conn>('/api/demo', { method: 'POST' })
    expect(first).toMatchObject({ demo: true, dialect: 'sqlite' })
    const again = await $fetch<Conn>('/api/demo', { method: 'POST' })
    expect(again.id).toBe(first.id)

    const rows = await $fetch<{ rows: unknown[] }>(`/api/c/${first.id}/tables/users/rows`, {
      method: 'POST',
      body: { schema: 'main', filter: null, sort: [], limit: 5, offset: 0 },
    })
    expect(rows.rows).toHaveLength(5)

    await $fetch(`/api/c/${first.id}/mutations`, {
      method: 'POST',
      body: { schema: 'main', ops: [{ type: 'delete', table: 'audit_logs', pk: { id: 1 } }] },
    })
    const reset = await $fetch<Conn>('/api/demo/reset', { method: 'POST' })
    expect(reset.id).toBe(first.id)
    const count = await $fetch<{ count: number }>(`/api/c/${first.id}/tables/audit_logs/count`, {
      method: 'POST',
      body: { schema: 'main', filter: { type: 'condition', column: 'id', op: 'eq', value: 1 }, exact: true },
    })
    expect(count.count).toBe(1)

    const all = await $fetch<Conn[]>('/api/connections')
    expect(all.filter((c) => c.demo)).toHaveLength(1)
  })

  it('exposes the example virtual relation of the demo', async () => {
    const demo = await $fetch<Conn>('/api/demo', { method: 'POST' })
    const list = await $fetch<{ fromTable: string; toTable: string }[]>(`/api/c/${demo.id}/virtual-relations`, {
      query: { schema: 'main' },
    })
    expect(list.some((r) => r.fromTable === 'audit_logs' && r.toTable === 'users')).toBe(true)
  })
})
