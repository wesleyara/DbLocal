import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

/** Shortcuts are registered on hydration: pressing a key before that is lost. */
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

const dir = join(process.cwd(), '.data', 'e2e-productivity')
const file = join(dir, 'prod.sqlite')
let connectionId = ''

test.beforeAll(async ({ request }) => {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const db = new Database(file)
  db.exec(`
    create table users (id integer primary key, email text not null);
    insert into users values (1, 'ana@example.com'), (42, 'zelia@example.com');
    create table orders (id integer primary key, note text);
    insert into orders values (1, 'rush for zelia@example.com');
  `)
  db.close()
  const res = await request.post('/api/connections', {
    data: { name: 'E2E productivity', dialect: 'sqlite', filePath: file, environment: 'local' },
  })
  expect(res.ok()).toBeTruthy()
  connectionId = (await res.json()).id
})

test.afterAll(async ({ request }) => {
  if (connectionId) await request.delete(`/api/connections/${connectionId}`)
  rmSync(dir, { recursive: true, force: true })
})

const home = () => `/c/${connectionId}/main`

test('⌘K opens a table by typing and Enter', async ({ page }) => {
  await page.goto(home())
  await hydrated(page)
  await page.keyboard.press('Control+k')
  const input = page.locator('[data-palette-input]')
  await expect(input).toBeFocused()
  await input.fill('ord')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/t\/orders/)
})

test('#table pk goes straight to the record', async ({ page }) => {
  await page.goto(home())
  await hydrated(page)
  await page.keyboard.press('Control+k')
  await page.locator('[data-palette-input]').fill('#users 42')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/t\/users\?.*r=/)
  await expect(page.locator('[data-record-panel]')).toContainText('zelia@example.com')
})

test('? shows the cheat sheet and Escape closes it', async ({ page }) => {
  await page.goto(`${home()}/t/users`)
  await hydrated(page)
  await page.getByRole('columnheader', { name: /email/ }).waitFor()
  await page.keyboard.press('?')
  await expect(page.locator('[data-shortcuts-sheet]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-shortcuts-sheet]')).toBeHidden()
})

test('global search finds an e-mail across tables', async ({ page }) => {
  await page.goto(`${home()}/t/users`)
  await hydrated(page)
  await page.keyboard.press('Control+Shift+f')
  await page.locator('[data-search-input]').fill('zelia@example.com')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-search-table="users"]')).toBeVisible()
  await expect(page.locator('[data-search-table="orders"]')).toBeVisible()
})
