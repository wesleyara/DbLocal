import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

/** Structure editing on a throw-away SQLite file: rename, add, rebuild, create and drop. */
const dir = join(process.cwd(), '.data', 'e2e-structure')
const file = join(dir, 'shop.sqlite')
let id = ''

test.beforeAll(async ({ request }) => {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const db = new Database(file)
  db.exec(`
    create table users (id integer primary key, name text not null, role text default 'user');
    insert into users values (1, 'Ana', 'admin'), (2, 'Bruno', null);
  `)
  db.close()
  const res = await request.post('/api/connections', { data: { name: 'E2E structure', dialect: 'sqlite', filePath: file, environment: 'local' } })
  id = (await res.json()).id
})

test.afterAll(async ({ request }) => {
  await request.delete(`/api/connections/${id}`)
  rmSync(dir, { recursive: true, force: true })
})

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

const read = (sql: string) => {
  const db = new Database(file, { readonly: true })
  try {
    return db.prepare(sql).all()
  } finally {
    db.close()
  }
}

// The first test also pays for the dev server compiling the page.
test.describe.configure({ mode: 'serial', timeout: 60_000 })

test('edits columns of a table, shows the SQL and runs it', async ({ page }) => {
  await open(page, `/c/${id}/main/t/users`)
  await page.locator('[data-toggle-structure]').click()
  await page.locator('[data-edit-structure]').click()
  const role = page.locator('[data-column-row]').nth(2)
  await role.locator('[data-column-name]').fill('kind')
  await role.locator('[data-column-nullable]').click() // NOT NULL: SQLite rebuilds the table
  await page.locator('[data-add-column]').click()
  const added = page.locator('[data-column-row]').last()
  await added.locator('[data-column-name]').fill('age')
  await added.locator('[data-column-type]').fill('INTEGER')
  await added.locator('[data-column-default]').fill('0')
  await expect(page.locator('[data-structure-rebuild]')).toBeVisible()
  await page.locator('[data-review-structure]').click()
  const confirm = page.locator('[data-run-confirm]')
  await expect(confirm).toContainText('INSERT INTO "main"."users__dblocal_new"')
  await page.locator('[data-confirm-alert-run]').click()
  await expect(page.locator('[data-structure-editor]')).toHaveCount(0)
  expect(read('select id, name, kind, age from users order by id')).toEqual([
    { id: 1, name: 'Ana', kind: 'admin', age: 0 },
    { id: 2, name: 'Bruno', kind: 'user', age: 0 },
  ])
})

test('creates a table with a foreign key and opens it, then drops it', async ({ page }) => {
  await open(page, `/c/${id}/main/t/users`)
  await page.locator('[data-new-table]').click()
  await page.locator('[data-table-name]').fill('posts')
  await page.locator('[data-add-column]').click()
  const userId = page.locator('[data-column-row]').last()
  await userId.locator('[data-column-name]').fill('user_id')
  await userId.locator('[data-column-type]').fill('INTEGER')
  await page.locator('[data-new-foreign-key] [role="combobox"]').first().click()
  await page.getByRole('option', { name: 'user_id' }).click()
  await page.locator('[data-new-foreign-key] [role="combobox"]').nth(1).click()
  await page.getByRole('option', { name: 'users' }).click()
  await page.locator('[data-add-fk]').click()
  await page.locator('[data-create-table]').click()
  await expect(page.locator('[data-run-confirm]')).toContainText('CREATE TABLE "main"."posts"')
  await page.locator('[data-confirm-alert-run]').click()
  await expect(page).toHaveURL(/\/t\/posts/)
  expect(read("select \"table\", \"from\", \"to\" from pragma_foreign_key_list('posts')")).toEqual([{ table: 'users', from: 'user_id', to: 'id' }])

  await page.locator('[data-toggle-structure]').click()
  await page.locator('[data-edit-structure]').click()
  await page.locator('[data-drop-table]').click()
  await expect(page.locator('[data-run-confirm]')).toContainText('DROP TABLE "main"."posts"')
  await page.locator('[data-confirm-alert-run]').click()
  await expect(page).not.toHaveURL(/\/t\/posts/)
  expect(read("select name from sqlite_schema where name = 'posts'")).toEqual([])
})
