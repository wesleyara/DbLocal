import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/** users <- orders (ON DELETE CASCADE), plus a table with no key and a view. */
const dir = join(process.cwd(), '.data', 'e2e-editing')
const file = join(dir, 'shop.sqlite')
const ids: Record<string, string> = {}

/** Rebuilds the data in place: the server keeps the file open, so it must never be deleted and recreated. */
function seed(): void {
  const db = new Database(file)
  db.exec(`
    drop view if exists user_names;
    drop table if exists orders;
    drop table if exists loose;
    drop table if exists users;
    create table users (id integer primary key, name text not null, email text unique, active boolean not null default 1, born date);
    create table orders (id integer primary key, user_id integer references users(id) on delete cascade, note text default 'none');
    create table loose (label text, value text);
    create view user_names as select id, name from users;
    insert into users (id, name, email, born) values (1, 'Ana Souza', 'ana@x.test', '1990-05-06'), (2, 'Bruno Lima', 'bruno@x.test', null), (3, 'Carla Dias', 'carla@x.test', null);
    insert into orders (id, user_id, note) values (10, 1, 'first'), (11, 1, 'second'), (12, 2, 'third');
    insert into loose values ('a', 'b');
  `)
  db.close()
}

async function connect(request: APIRequestContext, name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await request.post('/api/connections', {
    data: { name, dialect: 'sqlite', filePath: file, environment: 'local', ...extra },
  })
  expect(res.ok()).toBeTruthy()
  return (await res.json()).id
}

async function rows(request: APIRequestContext, id: string, table: string): Promise<Record<string, unknown>[]> {
  const res = await request.post(`/api/c/${id}/tables/${table}/rows`, {
    data: { schema: 'main', filter: null, sort: [{ column: 'id', direction: 'asc' }], limit: 100, offset: 0 },
  })
  return (await res.json()).rows
}

test.beforeAll(async ({ request }) => {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  seed()
  ids.rw = await connect(request, 'E2E rw')
  ids.ro = await connect(request, 'E2E ro', { readonly: true })
  ids.prod = await connect(request, 'E2E prod', { environment: 'prod' })
})

test.afterAll(async ({ request }) => {
  for (const id of Object.values(ids)) await request.delete(`/api/connections/${id}`)
  rmSync(dir, { recursive: true, force: true })
})

test.beforeEach(() => seed())

async function open(page: Page, id: string, table: string): Promise<void> {
  await page.goto(`/c/${id}/main/t/${table}`)
  // A click before hydration hits the server-rendered button, which has no listener yet.
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
const cell = (page: Page, row: number, col: number) => page.locator(`[data-r="${row}"][data-c="${col}"]`)

async function editCell(page: Page, row: number, col: number, text: string): Promise<void> {
  await cell(page, row, col).dblclick()
  const input = page.locator('[data-cell-editor] input')
  await input.fill(text)
  await input.press('Enter')
}

test('editing cells keeps changes pending, highlighted, until Save writes them in one transaction', async ({ page, request }) => {
  await open(page, ids.rw!, 'users')
  await expect(cell(page, 0, 1)).toContainText('Ana Souza')
  await editCell(page, 0, 1, 'Ana S.')
  await editCell(page, 1, 1, 'Bruno L.')
  await expect(page.locator('[data-pending-count]')).toContainText('2')
  await expect(cell(page, 0, 1)).toContainText('Ana S.')
  await expect(cell(page, 0, 1)).toHaveAttribute('title', /Ana Souza/)
  // Nothing is written yet.
  expect((await rows(request, ids.rw!, 'users'))[0]!.name).toBe('Ana Souza')

  await page.locator('[data-save]').click()
  await expect(page.locator('[data-pending-bar]')).toHaveCount(0)
  const saved = await rows(request, ids.rw!, 'users')
  expect(saved.map((r) => r.name)).toEqual(['Ana S.', 'Bruno L.', 'Carla Dias'])
})

test('Preview SQL shows the statements without running them', async ({ page, request }) => {
  await open(page, ids.rw!, 'users')
  await editCell(page, 0, 1, "O'Neil")
  await page.locator('[data-preview-sql]').click()
  const sql = page.locator('[data-sql-preview]')
  await expect(sql).toContainText('update "main"."users" set "name" = \'O\'\'Neil\' where "id" = 1')
  expect((await rows(request, ids.rw!, 'users'))[0]!.name).toBe('Ana Souza')
})

test('a number or date column rejects invalid input and keeps the editor open', async ({ page }) => {
  await open(page, ids.rw!, 'orders')
  await cell(page, 0, 0).dblclick() // id is the key but not generated for sqlite integer pk? it is editable text-number
  const input = page.locator('[data-cell-editor] input')
  await input.fill('abc')
  await input.press('Enter')
  await expect(page.locator('[data-cell-editor] [role="alert"]')).toBeVisible()
  await input.press('Escape')
  await expect(page.locator('[data-cell-editor]')).toHaveCount(0)
  await expect(page.locator('[data-pending-bar]')).toHaveCount(0)
})

test('Add record inserts a row with defaults and shows them as DEFAULT', async ({ page, request }) => {
  await open(page, ids.rw!, 'orders')
  await page.locator('[data-add-record]').click()
  await expect(page.locator('[data-row-state="new"]')).toHaveCount(1)
  await expect(page.locator('[data-row-state="new"] [data-default-badge]').first()).toBeVisible()
  // user_id is a foreign key: it is picked by name.
  await cell(page, 0, 1).dblclick()
  await page.locator('[data-fk-search]').fill('carla')
  await page.locator('[data-fk-option]', { hasText: 'Carla' }).click()
  await page.locator('[data-save]').click()
  await expect(page.locator('[data-pending-bar]')).toHaveCount(0)
  const all = await rows(request, ids.rw!, 'orders')
  expect(all).toHaveLength(4)
  expect(all.at(-1)).toMatchObject({ user_id: 3, note: 'none' })
})

test('deleting a user shows what cascades before it is marked, and Discard undoes it', async ({ page, request }) => {
  await open(page, ids.rw!, 'users')
  await cell(page, 0, 1).click()
  await page.keyboard.press('Delete')
  const impact = page.locator('[data-impact-list]')
  await expect(impact).toContainText('orders')
  await expect(impact).toContainText('2')
  await expect(impact).toContainText('CASCADE')
  await page.locator('[data-confirm-delete]').click()
  await expect(page.locator('[data-row-state="deleted"]')).toHaveCount(1)
  await page.locator('[data-discard]').click()
  await page.locator('[data-confirm-discard]').click()
  await expect(page.locator('[data-row-state="deleted"]')).toHaveCount(0)
  expect(await rows(request, ids.rw!, 'users')).toHaveLength(3)
})

test('a failed save keeps every pending change and marks the row that failed', async ({ page, request }) => {
  await open(page, ids.rw!, 'users')
  await editCell(page, 1, 1, 'Bruno X')
  await editCell(page, 2, 2, 'ana@x.test') // email is UNIQUE and Ana has it
  await expect(page.locator('[data-pending-count]')).toContainText('2')
  await page.locator('[data-save]').click()
  // The row of the failing edit is marked with the database's message; nothing was lost.
  const failed = page.locator('[data-row-error]')
  await expect(failed).toHaveCount(1)
  await expect(failed).toHaveAttribute('title', /UNIQUE/i)
  await expect(page.locator('[data-pending-count]')).toContainText('2')
  // Transaction rolled back: the valid edit was not applied either.
  expect((await rows(request, ids.rw!, 'users'))[1]!.name).toBe('Bruno Lima')
})

test('a read-only connection shows no editing UI and the API refuses', async ({ page, request }) => {
  await open(page, ids.ro!, 'users')
  await expect(cell(page, 0, 1)).toContainText('Ana Souza')
  await expect(page.locator('[data-add-record]')).toHaveCount(0)
  await cell(page, 0, 1).dblclick()
  await expect(page.locator('[data-cell-editor]')).toHaveCount(0)
  await expect(page.locator('[data-readonly-notice]')).toBeVisible()
  const res = await request.post(`/api/c/${ids.ro}/mutations`, {
    data: { schema: 'main', ops: [{ type: 'delete', table: 'users', pk: { id: 1 } }] },
  })
  expect(res.status()).toBe(403)
})

test('views and tables without a key are read-only', async ({ page }) => {
  await open(page, ids.rw!, 'user_names')
  await expect(page.locator('[data-readonly-notice]')).toBeVisible()
  await expect(page.locator('[data-add-record]')).toHaveCount(0)
  await open(page, ids.rw!, 'loose')
  await expect(page.locator('[data-readonly-notice]')).toBeVisible()
  await expect(page.locator('[data-add-record]')).toHaveCount(0)
})

test('saving on a prod connection needs the connection name typed', async ({ page, request }) => {
  await open(page, ids.prod!, 'users')
  await editCell(page, 0, 1, 'Ana Prod')
  await page.locator('[data-save]').click()
  const confirm = page.locator('[data-prod-save]')
  await expect(confirm).toBeDisabled()
  await page.locator('[data-prod-confirm]').fill('E2E prod')
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(page.locator('[data-pending-bar]')).toHaveCount(0)
  expect((await rows(request, ids.prod!, 'users'))[0]!.name).toBe('Ana Prod')
})

test('the record panel edits the same pending changes', async ({ page, request }) => {
  await open(page, ids.rw!, 'users')
  await cell(page, 0, 1).click()
  await page.keyboard.press('Space')
  const panel = page.locator('[data-record-panel]')
  await expect(panel).toBeVisible()
  await panel.locator('[data-field="name"]').hover()
  await panel.locator('[data-field="name"] [data-field-edit]').click()
  const input = panel.locator('[data-cell-editor] input')
  await input.fill('Ana Panel')
  await input.press('Enter')
  await expect(page.locator('[data-pending-count]')).toContainText('1')
  await page.keyboard.press('Control+s')
  await expect(page.locator('[data-pending-bar]')).toHaveCount(0)
  expect((await rows(request, ids.rw!, 'users'))[0]!.name).toBe('Ana Panel')
})

test('Import reads a CSV, lists invalid records and upserts the rest by key', async ({ page, request }) => {
  await open(page, ids.rw!, 'users')
  await page.locator('[data-import]').click()
  const csv = 'ID;Name;active;born\n1;Ana Nova;sim;\n4;Dora;no;2001-02-03\n5;Eva;maybe;\n'
  await page.locator('[data-import-file]').setInputFiles({ name: 'users.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(page.locator('[data-import-count]')).toContainText('3')
  await expect(page.locator('[data-import-invalid]')).toContainText('Record 3, active')
  const run = page.locator('[data-import-run]')
  await expect(run).toBeDisabled()
  await page.locator('[data-import-skip-invalid]').click()
  // Insert would collide with Ana's id; insert-or-update keeps her row and changes the name.
  await page.locator('[data-import-mode] [role="combobox"]').click()
  await page.getByRole('option', { name: /update/ }).click()
  await run.click()
  await expect(page.locator('[data-import-dialog]')).toHaveCount(0)
  const all = await rows(request, ids.rw!, 'users')
  expect(all.map((r) => r.name)).toEqual(['Ana Nova', 'Bruno Lima', 'Carla Dias', 'Dora'])
  expect(all[0]).toMatchObject({ email: 'ana@x.test' })
  expect(all[3]).toMatchObject({ active: 0, born: '2001-02-03' })
  await expect(cell(page, 3, 1)).toContainText('Dora')
})
