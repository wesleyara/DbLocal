import Database from 'better-sqlite3'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

/** Dump a SQLite connection from its card, restore the file into an empty one, export the workspace. */
const dir = join(process.cwd(), '.data', 'e2e-backup')
const source = join(dir, 'source.sqlite')
const target = join(dir, 'target.sqlite')
const ids: string[] = []

const hydrated = (page: Page) => page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)

test.beforeAll(async ({ request }) => {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const db = new Database(source)
  db.exec(`
    create table authors (id integer primary key, name text not null unique);
    create table books (id integer primary key, author_id integer references authors(id), title text not null);
    insert into authors values (1, 'Ana'), (2, 'Bruno');
    insert into books values (1, 1, 'First'), (2, 1, 'Second'), (3, 2, 'Third');
    create trigger books_title before insert on books when new.title = '' begin select raise(abort, 'empty title'); end;
  `)
  db.close()
  new Database(target).close()
  for (const [name, filePath] of [
    ['E2E backup source', source],
    ['E2E backup target', target],
  ]) {
    const res = await request.post('/api/connections', { data: { name, dialect: 'sqlite', filePath, environment: 'local' } })
    expect(res.ok()).toBeTruthy()
    ids.push((await res.json()).id)
  }
})

test.afterAll(async ({ request }) => {
  for (const id of ids) await request.delete(`/api/connections/${id}`)
  rmSync(dir, { recursive: true, force: true })
})

test('dumps a connection and restores the file into another', async ({ page }) => {
  await page.goto('/')
  await hydrated(page)
  const card = page.locator('article', { hasText: 'E2E backup source' })
  await card.locator('[data-backup-menu]').click()
  await page.getByRole('menuitem', { name: /Dump|SQL/ }).first().click()
  await expect(page.locator('[data-dump-dialog]')).toBeVisible()
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-dump-run]').click()])
  const file = join(dir, 'dump.sql')
  await download.saveAs(file)
  const sql = readFileSync(file, 'utf8')
  expect(sql).toContain('CREATE TABLE "books"')
  expect(sql).toContain('CREATE TRIGGER books_title')

  const targetCard = page.locator('article', { hasText: 'E2E backup target' })
  await targetCard.locator('[data-backup-menu]').click()
  await page.getByRole('menuitem').nth(1).click()
  await page.locator('[data-restore-file]').setInputFiles(file)
  await page.locator('[data-restore-run]').click()
  await expect(page.locator('[data-restore-done]')).toBeVisible()

  const copy = new Database(target, { readonly: true })
  expect(copy.prepare('select count(*) as n from books').get()).toEqual({ n: 3 })
  expect(copy.prepare("select name from sqlite_schema where type = 'trigger'").all()).toEqual([{ name: 'books_title' }])
  copy.close()
})

test('a failing statement stops the restore and is shown', async ({ page }) => {
  const bad = join(dir, 'bad.sql')
  writeFileSync(bad, 'create table ok_1 (id integer);\ninsert into missing values (1);\ncreate table ok_2 (id integer);\n')
  await page.goto('/')
  await hydrated(page)
  await page.locator('article', { hasText: 'E2E backup target' }).locator('[data-backup-menu]').click()
  await page.getByRole('menuitem').nth(1).click()
  await page.locator('[data-restore-file]').setInputFiles(bad)
  await page.locator('[data-restore-run]').click()
  await expect(page.locator('[data-restore-error]')).toContainText('missing')
})

test('exports the workspace from the settings', async ({ page }) => {
  await page.goto('/')
  await hydrated(page)
  await page.keyboard.press('Control+k')
  await page.keyboard.type('settings')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-workspace-backup]')).toBeVisible()
  await page.locator('[data-workspace-password]').fill('long enough')
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-workspace-export]').click()])
  const backup = JSON.parse(readFileSync(await download.path(), 'utf8'))
  expect(backup.format).toBe('dblocal-workspace')
  expect(backup.kdf).not.toBeNull()
  expect(backup.connections.some((c: { name: string }) => c.name === 'E2E backup source')).toBe(true)
})
