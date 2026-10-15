import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

/** users -> orders -> order_items -> products, with products <-> tags through a junction. */
const dir = join(process.cwd(), '.data', 'e2e-relations')
const file = join(dir, 'shop.sqlite')
let connectionId = ''

test.beforeAll(async ({ request }) => {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const db = new Database(file)
  db.exec(`
    create table users (id integer primary key, name text not null);
    create table orders (id integer primary key, user_id integer not null references users(id));
    create table products (id integer primary key, title text not null);
    create table order_items (id integer primary key, order_id integer not null references orders(id), product_id integer not null references products(id));
    create table tags (id integer primary key, label text not null);
    create table product_tags (product_id integer not null references products(id), tag_id integer not null references tags(id), primary key (product_id, tag_id));
    insert into users values (1, 'Ana Souza'), (2, 'Bruno Lima');
    insert into orders values (10, 1), (11, 1), (12, 2);
    insert into products values (100, 'Mug'), (101, 'Pen');
    insert into order_items values (1, 10, 100), (2, 10, 101), (3, 11, 100), (4, 12, 101);
    insert into tags values (1, 'home'), (2, 'office');
    insert into product_tags values (100, 1), (100, 2), (101, 2);
  `)
  db.close()
  const res = await request.post('/api/connections', {
    data: { name: 'E2E relations', dialect: 'sqlite', filePath: file, environment: 'local' },
  })
  expect(res.ok()).toBeTruthy()
  connectionId = (await res.json()).id
})

test.afterAll(async ({ request }) => {
  if (connectionId) await request.delete(`/api/connections/${connectionId}`)
  rmSync(dir, { recursive: true, force: true })
})

const url = (table: string) => `/c/${connectionId}/main/t/${table}`

test('a foreign key shows the parent as a chip and opens the record panel', async ({ page }) => {
  await page.goto(url('orders'))
  const chip = page.locator('[data-fk-chip="users"]').first()
  await expect(chip).toContainText('Ana Souza')
  await chip.click()
  const panel = page.locator('[data-record-panel]')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('Ana Souza')
  await expect(page).toHaveURL(/[?&]r=/)
  // Has many: the orders of this user, counted.
  await expect(panel.locator('[data-child-relation]').first()).toContainText('2')
})

test('a count column opens the child table filtered, with a removable relation chip', async ({ page }) => {
  await page.goto(url('users'))
  await page.locator('[data-relation-count="orders"]').first().click()
  await expect(page).toHaveURL(/\/t\/orders\?.*rel=/)
  await expect(page.locator('[data-relation-chip]')).toContainText('orders of users #1')
  await expect(page.getByText(/1–2 (of|de) 2/)).toBeVisible()
  await page.locator('[data-relation-chip] button').click()
  await expect(page.locator('[data-relation-chip]')).toHaveCount(0)
  await expect(page.getByText(/1–3 (of|de) 3/)).toBeVisible()
})

test('many-to-many works in both directions and the trail goes back', async ({ page }) => {
  await page.goto(url('products'))
  await page.locator('[data-relation-count="tags"]').first().click()
  await expect(page.locator('[data-relation-chip]')).toContainText('tags of products #100')
  await expect(page.getByText(/1–2 (of|de) 2/)).toBeVisible()
  await expect(page.locator('[data-breadcrumb]')).toContainText('products')
  await expect(page.locator('[data-breadcrumb]')).toContainText('tags')
  await page.getByRole('button', { name: /^(Back|Voltar)$/ }).first().click()
  await expect(page).toHaveURL(/\/t\/products/)
})

test('a deep link to a record reproduces the panel', async ({ page }) => {
  await page.goto(url('orders'))
  await page.locator('[data-fk-chip="users"]').first().click()
  await expect(page.locator('[data-record-panel]')).toBeVisible()
  const link = page.url()
  await page.goto('about:blank')
  await page.goto(link)
  await expect(page.locator('[data-record-panel]')).toContainText('Ana Souza')
})
