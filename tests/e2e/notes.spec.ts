import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

/** A throw-away SQLite file with one table, created before the suite runs. */
const dir = join(process.cwd(), '.data', 'e2e-notes')
const file = join(dir, 'notes.sqlite')
let connectionId = ''

test.beforeAll(async ({ request }) => {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const db = new Database(file)
  db.exec("create table items (id integer primary key, name text not null); insert into items values (1, 'one'), (2, 'two')")
  db.close()
  const res = await request.post('/api/connections', {
    data: { name: 'E2E notes', dialect: 'sqlite', filePath: file, environment: 'local' },
  })
  expect(res.ok()).toBeTruthy()
  connectionId = (await res.json()).id
})

test.afterAll(async ({ request }) => {
  if (connectionId) {
    await request.put(`/api/c/${connectionId}/notes`, { data: { content: '' } })
    await request.put(`/api/c/${connectionId}/tables/items/notes`, { data: { schema: 'main', content: '' } })
    await request.delete(`/api/connections/${connectionId}`)
  }
  rmSync(dir, { recursive: true, force: true })
})

async function hydrated(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

test('the grid toolbar hides the extra tools behind a toggle and remembers it', async ({ page }) => {
  await page.goto(`/c/${connectionId}/main/t/items`)
  await hydrated(page)
  await expect(page.locator('[data-toggle-structure]')).toBeVisible()
  await expect(page.locator('[data-toggle-history]')).toHaveCount(0)
  await page.locator('[data-toggle-tools]').click()
  for (const tool of ['[data-advanced-filters]', '[data-toggle-sql]', '[data-toggle-history]', '[data-toggle-notes]']) {
    await expect(page.locator(tool)).toBeVisible()
  }
  await page.reload()
  await hydrated(page)
  await expect(page.locator('[data-toggle-notes]')).toBeVisible()
  await page.locator('[data-toggle-tools]').click()
  await expect(page.locator('[data-toggle-notes]')).toHaveCount(0)
})

test('a table note is saved as you type and marks the table', async ({ page, request }) => {
  await page.goto(`/c/${connectionId}/main/t/items`)
  await hydrated(page)
  await page.locator('[data-toggle-tools]').click()
  await page.locator('[data-toggle-notes]').click()
  const editor = page.locator('[data-table-notes] .cm-content')
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.type('# Items\n\nKeep `name` unique.')
  await expect(page.locator('[data-table-notes] [data-note-status]')).toHaveAttribute('data-status', 'saved')
  const saved = await (await request.get(`/api/c/${connectionId}/tables/items/notes?schema=main`)).json()
  expect(saved.content).toContain('Keep `name` unique.')

  await page.locator('[data-table-notes] [data-md-mode="preview"]').click()
  await expect(page.locator('[data-table-notes] [data-md-preview] h1')).toHaveText('Items')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-toggle-notes][data-has-notes]')).toBeVisible()
})

test('connection notes open in their own tab from the top bar', async ({ page, request }) => {
  await page.goto(`/c/${connectionId}/main/t/items`)
  await hydrated(page)
  await page.locator('[data-open-notes]').click()
  await expect(page).toHaveURL(new RegExp(`/c/${connectionId}/main/notes$`))
  const editor = page.locator('[data-connection-notes] .cm-content')
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.type('Staging copy, refreshed nightly.')
  await expect(page.locator('[data-connection-notes] [data-note-status]')).toHaveAttribute('data-status', 'saved')
  const saved = await (await request.get(`/api/c/${connectionId}/notes`)).json()
  expect(saved.content).toBe('Staging copy, refreshed nightly.')

  // One tab per connection: the button reuses it.
  await page.goto(`/c/${connectionId}/main/t/items`)
  await hydrated(page)
  await page.locator('[data-open-notes]').click()
  await expect(page.locator('[data-connection-notes] .cm-content')).toContainText('Staging copy')
})
