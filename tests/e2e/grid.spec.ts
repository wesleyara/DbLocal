import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { encodeUrlState } from '../../shared/grid-url'

/** A throw-away SQLite file with 60 items, one binary column, created before the suite runs. */
const dir = join(process.cwd(), '.data', 'e2e-fixtures')
const file = join(dir, 'grid.sqlite')
let connectionId = ''

test.beforeAll(async ({ request }) => {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const db = new Database(file)
  db.exec('create table items (id integer primary key, name text not null, price integer not null, payload blob)')
  const insert = db.prepare('insert into items values (?, ?, ?, ?)')
  for (let i = 1; i <= 60; i++) insert.run(i, `item ${String(i).padStart(2, '0')}`, i * 10, Buffer.from([i, 1, 2, 3]))
  db.close()

  const res = await request.post('/api/connections', {
    data: { name: 'E2E grid', dialect: 'sqlite', filePath: file, environment: 'local' },
  })
  expect(res.ok()).toBeTruthy()
  connectionId = (await res.json()).id
})

test.afterAll(async ({ request }) => {
  if (connectionId) await request.delete(`/api/connections/${connectionId}`)
  rmSync(dir, { recursive: true, force: true })
})

const gridUrl = (query = '') => `/c/${connectionId}/main/t/items${query ? '?' + query.replace(/^&/, '') : ''}`

test('reads the first page and shows the row count', async ({ page }) => {
  await page.goto(gridUrl())
  await expect(page.getByRole('columnheader', { name: /name/ })).toBeVisible()
  await expect(page.getByText('1–60 de 60').or(page.getByText('1–60 of 60'))).toBeVisible()
})

test('the table page hydrates without mismatches', async ({ page }) => {
  const problems: string[] = []
  page.on('console', (msg) => {
    if (/hydration|intlify/i.test(msg.text())) problems.push(msg.text())
  })
  await page.goto(gridUrl())
  await expect(page.getByRole('columnheader', { name: /name/ })).toBeVisible()
  // The sidebar tree is rendered on the server with the schema already loaded.
  await expect(page.getByRole('treeitem').first()).toBeVisible()
  expect(problems).toEqual([])
})

test('filters from a deep link and reports the match', async ({ page }) => {
  const f = encodeUrlState({ type: 'group', logic: 'and', children: [{ type: 'condition', column: 'price', op: 'gte', value: 550 }] })
  await page.goto(gridUrl(`&f=${f}`))
  await expect(page.getByText(/1–6 (de|of) 6/)).toBeVisible()
})

test('sorts from a deep link', async ({ page }) => {
  const s = encodeUrlState([{ column: 'name', direction: 'desc' }])
  await page.goto(gridUrl(`&s=${s}`))
  const firstName = page.getByRole('gridcell').filter({ hasText: /^item / }).first()
  await expect(firstName).toHaveText('item 60')
})

test('pins a column and keeps the choice after reload', async ({ page, request }) => {
  await page.goto(gridUrl())
  await expect(page.getByRole('columnheader', { name: /name/ })).toBeVisible()
  const saved = await request.put(`/api/c/${connectionId}/tables/items/prefs`, {
    data: { schema: 'main', prefs: { widths: {}, hidden: [], order: [], pinned: ['name'] } },
  })
  expect(saved.ok()).toBeTruthy()
  await page.reload()
  await expect(page.locator('[data-pinned="name"]')).toBeVisible()
})

test('downloads a binary cell as stored', async ({ request }) => {
  const res = await request.post(`/api/c/${connectionId}/tables/items/blob`, {
    data: { schema: 'main', column: 'payload', key: { id: 7 } },
  })
  expect(res.ok()).toBeTruthy()
  expect([...(await res.body())]).toEqual([7, 1, 2, 3])
})
