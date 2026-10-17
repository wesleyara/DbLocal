import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { encodeUrlState } from '../../shared/grid-url'

/**
 * The critical flows, once per dialect, against the dev dataset (`pnpm db:up && pnpm db:seed`).
 * E2E_DIALECTS narrows the run (default: all three). A database that is down skips its dialect locally and
 * fails in CI, so a green run always means the dialect really ran.
 */
interface Target {
  dialect: 'sqlite' | 'postgres' | 'mysql'
  schema: string
  config: Record<string, unknown>
}

const targets: Target[] = [
  {
    dialect: 'sqlite',
    schema: 'main',
    config: { dialect: 'sqlite', filePath: join(process.cwd(), 'fixtures', 'dev.sqlite') },
  },
  {
    dialect: 'postgres',
    schema: 'public',
    config: { dialect: 'postgres', host: '127.0.0.1', port: 54329, user: 'dblocal', password: 'dblocal', database: 'dblocal_dev' },
  },
  {
    dialect: 'mysql',
    schema: 'dblocal_dev',
    config: { dialect: 'mysql', host: '127.0.0.1', port: 33069, user: 'dblocal', password: 'dblocal', database: 'dblocal_dev' },
  },
]
/** Opens a page and waits for hydration: a click before it hits server-rendered markup with no listener. */
async function visit(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

const wanted = (process.env.E2E_DIALECTS ?? 'sqlite,postgres,mysql').split(',').map((s) => s.trim())

for (const target of targets.filter((t) => wanted.includes(t.dialect))) {
  test.describe(`flows on ${target.dialect}`, () => {
    test.describe.configure({ mode: 'serial' })
    const ids: { rw?: string; ro?: string } = {}
    const tagName = `e2e-${target.dialect}-${Date.now()}`
    const grid = (table: string, query = '') => `/c/${ids.rw}/${encodeURIComponent(target.schema)}/t/${table}${query}`


    test.beforeAll(async ({ request }) => {
      const probe = await request.post('/api/connections/test', { data: target.config })
      if (!probe.ok()) {
        if (process.env.CI) throw new Error(`${target.dialect} is not reachable: ${await probe.text()}`)
        test.skip(true, `${target.dialect} is not reachable (run pnpm db:up && pnpm db:seed)`)
      }
      const create = async (name: string, extra: Record<string, unknown> = {}) => {
        const res = await request.post('/api/connections', {
          data: { name, environment: 'local', ...target.config, ...extra },
        })
        expect(res.ok()).toBeTruthy()
        return (await res.json()).id as string
      }
      ids.rw = await create(`E2E ${target.dialect}`)
      ids.ro = await create(`E2E ${target.dialect} ro`, { readonly: true })
    })

    test.afterAll(async ({ request }) => {
      if (ids.rw) {
        // Leftovers of an interrupted run.
        await request.post(`/api/c/${ids.rw}/query`, {
          data: { sql: "delete from tags where name like 'e2e-%'", schema: target.schema },
        })
      }
      for (const id of Object.values(ids)) if (id) await request.delete(`/api/connections/${id}`)
    })

    test('creates a connection and lists its tables', async ({ page }) => {
      await visit(page, `/c/${ids.rw}`)
      await expect(page).toHaveURL(new RegExp(`/c/${ids.rw}/${target.schema}`))
      await expect(page.getByRole('treeitem', { name: /users/ }).first()).toBeVisible()
    })

    test('navigates users → orders → shipments → order_items → product → tags through chips and counts', async ({ page }) => {
      await visit(page, grid('users'))
      await page.locator('[data-relation-count="orders"]').first().click()
      await expect(page).toHaveURL(/\/t\/orders\?.*rel=/)
      await expect(page.locator('[data-relation-chip]')).toContainText('orders of users #1')

      // The dataset hangs the items on shipments (composite key), not directly on orders.
      await page.locator('[data-relation-count="shipments"]').first().click()
      await expect(page).toHaveURL(/\/t\/shipments\?.*rel=/)
      await expect(page.locator('[data-relation-chip]')).toContainText('shipments of orders')

      await page.locator('[data-relation-count="order_items"]').first().click()
      await expect(page).toHaveURL(/\/t\/order_items\?.*rel=/)
      await expect(page.locator('[data-relation-chip]')).toContainText('order_items of shipments')

      await page.locator('[data-fk-chip="products"]').first().click()
      const panel = page.locator('[data-record-panel]')
      await expect(panel).toBeVisible()
      await expect(panel).toContainText('Product')

      // Many-to-many from the product record: its tags, through product_tags.
      await panel.getByRole('button', { name: /(View all|Ver todos) 3 .* tags$/ }).click()
      await expect(page).toHaveURL(/\/t\/tags\?.*rel=/)
      await expect(page.locator('[data-relation-chip]')).toContainText('tags of products')
      await expect(page.getByText(/1–3 (of|de) 3/)).toBeVisible()
    })

    test('filters and sorts from the URL', async ({ page }) => {
      const f = encodeUrlState({ type: 'group', logic: 'and', children: [{ type: 'condition', column: 'id', op: 'lte', value: 5 }] })
      const s = encodeUrlState([{ column: 'id', direction: 'desc' }])
      await visit(page, grid('users', `?f=${f}&s=${s}`))
      await expect(page.getByText(/1–5 (of|de) 5/)).toBeVisible()
      await expect(page.locator('[data-r="0"][data-c="0"]')).toContainText('5')
      await expect(page.locator('[data-r="4"][data-c="0"]')).toContainText('1')
    })

    test('creates, edits and deletes a record with save and discard', async ({ page, request }) => {
      await visit(page, grid('tags'))
      await page.locator('[data-add-record]').click()
      await expect(page.locator('[data-row-state="new"]')).toHaveCount(1)
      const nameCol = await page.getByRole('columnheader', { name: /name/ }).first().getAttribute('data-c')
      const cell = (r: number) => page.locator(`[data-r="${r}"][data-c="${nameCol ?? 1}"]`)
      await cell(0).dblclick()
      await page.locator('[data-cell-editor] input').fill(tagName)
      await page.locator('[data-cell-editor] input').press('Enter')
      await page.locator('[data-save]').click()
      await expect(page.locator('[data-pending-bar]')).toHaveCount(0)

      await visit(page, grid('tags', `?f=${encodeUrlState({ type: 'group', logic: 'and', children: [{ type: 'condition', column: 'name', op: 'eq', value: tagName }] })}`))
      await expect(page.getByText(/1–1 (of|de) 1/)).toBeVisible()

      // Edit and discard: nothing is written.
      await cell(0).dblclick()
      await page.locator('[data-cell-editor] input').fill(`${tagName}-x`)
      await page.locator('[data-cell-editor] input').press('Enter')
      await expect(page.locator('[data-pending-count]')).toContainText('1')
      await page.locator('[data-discard]').click()
      await page.locator('[data-confirm-discard]').click()
      await expect(cell(0)).toContainText(tagName)
      await expect(cell(0)).not.toContainText(`${tagName}-x`)

      // Delete and save.
      await cell(0).click()
      await page.keyboard.press('Delete')
      const confirm = page.locator('[data-confirm-delete]')
      if (await confirm.isVisible().catch(() => false)) await confirm.click()
      await expect(page.locator('[data-row-state="deleted"]')).toHaveCount(1)
      await page.locator('[data-save]').click()
      await expect(page.locator('[data-pending-bar]')).toHaveCount(0)
      const left = await request.post(`/api/c/${ids.rw}/tables/tags/count`, {
        data: {
          schema: target.schema,
          exact: true,
          filter: { type: 'group', logic: 'and', children: [{ type: 'condition', column: 'name', op: 'eq', value: tagName }] },
        },
      })
      expect((await left.json()).count).toBe(0)
    })

    test('runs a query, saves it and runs it again from the history', async ({ page }) => {
      await visit(page, grid('users'))
      await page.locator('[data-new-query]').click()
      await expect(page).toHaveURL(/\/q\//)
      const sql = 'select id, email from users where id = 1'
      await page.locator('[data-sql-editor]').click()
      await page.keyboard.insertText(sql)
      await page.locator('[data-run]').click()
      await expect(page.locator('[data-results]')).toContainText('user1@example.com')

      await page.locator('[data-save]').click()
      await page.getByPlaceholder('Query name').fill(`e2e ${target.dialect}`)
      await page.locator('[data-confirm-save]').click()
      await page.locator('[data-tab="saved"]').click()
      await expect(page.locator('[data-saved-query]', { hasText: `e2e ${target.dialect}` }).first()).toBeVisible()

      await page.locator('[data-tab="history"]').click()
      const entry = page.locator('[data-history-entry]', { hasText: 'where id = 1' }).first()
      await expect(entry).toBeVisible()
      await entry.getByRole('button', { name: 'Run again' }).click()
      // The statement opens in a new tab and runs there, so its result is on screen.
      await expect(page).toHaveURL(/\/q\/(?!.*run=)/)
      await expect(page.locator('[data-results]')).toContainText('user1@example.com')
    })

    test('the table view lists the query history and runs an entry again', async ({ page, request }) => {
      await request.post(`/api/c/${ids.rw}/query`, { data: { sql: 'select count(*) as n from tags', schema: target.schema } })
      await visit(page, grid('tags'))
      // History sits behind the toolbar's "more tools" toggle (collapsed by default).
      await page.locator('[data-toggle-tools]').click()
      await page.locator('[data-toggle-history]').click()
      const entry = page.locator('[data-history-dialog] [data-history-entry]', { hasText: 'from tags' }).first()
      await expect(entry).toBeVisible()
      await entry.locator('[data-history-rerun]').click()
      await expect(page).toHaveURL(/\/q\/(?!.*run=)/)
      await expect(page.locator('[data-results]')).toContainText('15')
    })

    test('the ERD opens and a table node opens the table', async ({ page }) => {
      await visit(page, `/c/${ids.rw}/${encodeURIComponent(target.schema)}/erd`)
      const node = page.locator('[data-table="users"]')
      await expect(node).toBeVisible({ timeout: 20_000 })
      // Vue Flow keeps nodes moving while it fits the view, so Playwright never sees them "stable".
      await node.dispatchEvent('dblclick')
      await expect(page).toHaveURL(/\/t\/users/)
    })

    test('a read-only connection offers no editing and the API refuses writes', async ({ page, request }) => {
      await visit(page, `/c/${ids.ro}/${encodeURIComponent(target.schema)}/t/users`)
      await expect(page.locator('[data-r="0"][data-c="0"]')).toBeVisible()
      await expect(page.locator('[data-add-record]')).toHaveCount(0)
      await expect(page.locator('[data-readonly-notice]')).toBeVisible()

      const mutation = await request.post(`/api/c/${ids.ro}/mutations`, {
        data: { schema: target.schema, ops: [{ type: 'delete', table: 'tags', pk: { id: 1 } }] },
      })
      expect(mutation.status()).toBe(403)
      const raw = await request.post(`/api/c/${ids.ro}/query`, {
        data: { sql: 'delete from tags where id = 1', schema: target.schema },
      })
      expect(raw.status()).toBe(403)
    })
  })
}

